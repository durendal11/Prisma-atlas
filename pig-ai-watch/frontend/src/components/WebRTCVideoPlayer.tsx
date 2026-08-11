import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, VideoOff, Wifi } from 'lucide-react';

interface WebRTCVideoPlayerProps {
  penId: string;
  token: string;
  className?: string;
  onConnected?: () => void;
  onError?: (err: string) => void;
}

export const WebRTCVideoPlayer: React.FC<WebRTCVideoPlayerProps> = ({
  penId,
  token,
  className = '',
  onConnected,
  onError,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'failed'>('connecting');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const connectWebRTC = useCallback(async () => {
    setStatus('connecting');
    setErrorMessage('');

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    try {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ],
      });
      pcRef.current = pc;

      pc.addTransceiver('video', { direction: 'recvonly' });

      pc.ontrack = (event) => {
        if (videoRef.current && event.streams[0]) {
          videoRef.current.srcObject = event.streams[0];
          videoRef.current.play().catch((e) => console.warn('Autoplay prevented:', e));
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setStatus('connected');
          onConnected?.();
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          setStatus('failed');
          const msg = 'WebRTC connection failed';
          setErrorMessage(msg);
          onError?.(msg);
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const whepUrl = `/api/stream/${penId}/whep?token=${encodeURIComponent(token)}`;
      const response = await fetch(whepUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: offer.sdp,
      });

      if (!response.ok) {
        throw new Error(`WHEP endpoint returned HTTP ${response.status}`);
      }

      const answerSdp = await response.text();
      await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: answerSdp }));
    } catch (err: any) {
      console.warn('WebRTC connection error:', err);
      setStatus('failed');
      const msg = err.message || 'Failed to establish WebRTC stream';
      setErrorMessage(msg);
      onError?.(msg);
    }
  }, [penId, token, onConnected, onError]);

  useEffect(() => {
    if (penId && token) {
      connectWebRTC();
    }

    return () => {
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
    };
  }, [penId, token, connectWebRTC]);

  return (
    <div className={`relative bg-black rounded-xl overflow-hidden ${className}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover rounded-xl"
      />

      {status === 'connecting' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 text-white gap-2 backdrop-blur-sm">
          <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
          <span className="text-xs font-medium text-slate-300">Connecting WebRTC Ultra-Low Latency...</span>
        </div>
      )}

      {status === 'connected' && (
        <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/80 text-white text-[10px] font-semibold tracking-wider uppercase backdrop-blur-md shadow-lg">
          <Wifi className="h-3 w-3 animate-pulse" />
          <span>WebRTC 60FPS</span>
        </div>
      )}

      {status === 'failed' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 text-white gap-3 p-4">
          <VideoOff className="h-8 w-8 text-amber-400" />
          <span className="text-xs text-slate-300 text-center">{errorMessage || 'WebRTC stream unavailable'}</span>
          <button
            onClick={connectWebRTC}
            className="px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-xs font-medium text-white transition-colors"
          >
            Retry WebRTC
          </button>
        </div>
      )}
    </div>
  );
};
