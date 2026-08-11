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
  const [isBuffering, setIsBuffering] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const handleFrameReady = useCallback(() => {
    // 350ms buffer for initial keyframe GOP decoding stabilization
    setTimeout(() => {
      setIsBuffering(false);
      setStatus('connected');
      onConnected?.();
    }, 350);
  }, [onConnected]);

  const connectWebRTC = useCallback(async () => {
    setStatus('connecting');
    setIsBuffering(true);
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
          videoRef.current.muted = true;
          videoRef.current.playsInline = true;
          videoRef.current.setAttribute('playsinline', 'true');
          videoRef.current.setAttribute('webkit-playsinline', 'true');
          videoRef.current.play().catch((e) => console.warn('Autoplay prevented:', e));
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          // Keep buffering until video element fires onPlaying / frame render
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          setStatus('failed');
          setIsBuffering(false);
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
      setIsBuffering(false);
      const msg = err.message || 'Failed to establish WebRTC stream';
      setErrorMessage(msg);
      onError?.(msg);
    }
  }, [penId, token, onError]);

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
        onPlaying={handleFrameReady}
        onLoadedData={handleFrameReady}
        className="w-full h-full object-cover rounded-xl"
        style={{
          transform: 'translateZ(0)',
          willChange: 'transform',
        }}
      />

      {(status === 'connecting' || isBuffering) && status !== 'failed' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 text-white gap-3 backdrop-blur-md transition-opacity duration-300 pointer-events-none">
          <div className="relative flex items-center justify-center">
            <div className="absolute w-12 h-12 rounded-full border-2 border-emerald-500/40 animate-ping" />
            <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
          </div>
          <div className="text-center space-y-0.5">
            <span className="text-xs font-semibold tracking-wide text-emerald-300 uppercase">Synchronizing 60 FPS Feed...</span>
            <p className="text-[11px] text-slate-400">Buffering smooth video frames</p>
          </div>
        </div>
      )}

      {status === 'connected' && !isBuffering && (
        <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/80 text-white text-[10px] font-semibold tracking-wider uppercase backdrop-blur-md shadow-lg animate-fade-in">
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
