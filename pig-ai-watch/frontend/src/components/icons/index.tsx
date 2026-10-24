import React from 'react';

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
  size?: number | string;
  color?: string;
  strokeWidth?: number | string;
}

/**
 * Tabler Pig icon: Authentic swine silhouette for sow profiles, herds, and livestock.
 * Sourced via Better Icons (tabler:pig)
 */
export function PigIcon({ className = 'h-5 w-5', size, color, strokeWidth = 2, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size || 24}
      height={size || 24}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M15 11v.01M16 3v3.803A6.02 6.02 0 0 1 18.658 10h1.341a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-1.342a6 6 0 0 1-1.658 2.473V18.5a1.5 1.5 0 0 1-3 0v-.583a6 6 0 0 1-1 .083h-4a6 6 0 0 1-1-.083v.583a1.5 1.5 0 0 1-3 0v-2.027A6 6 0 0 1 8.999 6h2.5z" />
    </svg>
  );
}

/**
 * Tabler Pig Filled icon: Solid swine silhouette for badges and active selections.
 * Sourced via Better Icons (tabler:pig-filled)
 */
export function PigFilledIcon({ className = 'h-5 w-5', size, color, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size || 24}
      height={size || 24}
      viewBox="0 0 24 24"
      fill={color || 'currentColor'}
      className={className}
      {...props}
    >
      <path d="M15.999 2A1 1 0 0 1 17 3v3.255l.026.018A7 7 0 0 1 19.23 8.81l.092.19h.676a2 2 0 0 1 1.995 1.85l.005.15v2a2 2 0 0 1-2 2h-.676l-.104.213a7 7 0 0 1-1.097 1.558l-.123.125V18.5a2.5 2.5 0 0 1-2.336 2.495L15.5 21c-1.16 0-2.135-.79-2.418-1.86l-.032-.141L9 19l-.05-.002l-.032.141a2.5 2.5 0 0 1-2.254 1.856L6.5 21A2.5 2.5 0 0 1 4 18.5v-1.602l-.056-.055a7 7 0 0 1-1.576-7.085l.092-.256A7 7 0 0 1 8.999 5h2.196l4.25-2.832a1 1 0 0 1 .436-.161zM15 10a1 1 0 0 0-.993.883L14 11.01a1 1 0 0 0 1.993.117L16 11a1 1 0 0 0-1-1" />
    </svg>
  );
}

/**
 * Tabler Fence icon: Enclosure / pen boundary representation for pens and Test Pen simulator.
 * Sourced via Better Icons (tabler:fence)
 */
export function FenceIcon({ className = 'h-5 w-5', size, color, strokeWidth = 2, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size || 24}
      height={size || 24}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M4 12v4h16v-4zm2 4v4h4v-4m0-4V6L8 4L6 6v6m8 4v4h4v-4m0-4V6l-2-2l-2 2v6" />
    </svg>
  );
}

/**
 * Tabler Camera AI icon: Camera combined with artificial intelligence symbol.
 * Sourced via Better Icons (tabler:camera-ai)
 */
export function CameraAiIcon({ className = 'h-5 w-5', size, color, strokeWidth = 2, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size || 24}
      height={size || 24}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M10 20H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1a2 2 0 0 0 2-2a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v2" />
      <path d="M14.362 11.15a3 3 0 1 0-4.144 4.263M14 21v-4a2 2 0 1 1 4 0v4m-4-2h4m3-4v6" />
    </svg>
  );
}

/**
 * Tabler Device CCTV icon: Specialized surveillance camera icon for live stream feeds.
 * Sourced via Better Icons (tabler:device-cctv)
 */
export function CctvIcon({ className = 'h-5 w-5', size, color, strokeWidth = 2, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size || 24}
      height={size || 24}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M3 4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zm5 10a4 4 0 1 0 8 0a4 4 0 1 0-8 0" />
      <path d="M19 7v7a7 7 0 0 1-14 0V7m7 7h.01" />
    </svg>
  );
}

/**
 * Lucide Scan Heart icon: Biometric & farrowing vital telemetry scanning.
 * Sourced via Better Icons (lucide:scan-heart)
 */
export function ScanHeartIcon({ className = 'h-5 w-5', size, color, strokeWidth = 2, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size || 24}
      height={size || 24}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M17 3h2a2 2 0 0 1 2 2v2m0 10v2a2 2 0 0 1-2 2h-2M3 7V5a2 2 0 0 1 2-2h2m0 18H5a2 2 0 0 1-2-2v-2m4.828-3.93A3 3 0 0 1 12 8.764a3 3 0 0 1 4.172 4.306l-3.447 3.62a1 1 0 0 1-1.449 0z" />
    </svg>
  );
}

/**
 * Lucide Scan Eye icon: Vision detection box with focus center for Replay and Edge detection.
 * Sourced via Better Icons (lucide:scan-eye)
 */
export function ScanEyeIcon({ className = 'h-5 w-5', size, color, strokeWidth = 2, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size || 24}
      height={size || 24}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M3 7V5a2 2 0 0 1 2-2h2m10 0h2a2 2 0 0 1 2 2v2m0 10v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
      <circle cx="12" cy="12" r="1.5" fill={color || 'currentColor'} />
      <path d="M18.944 12.33a1 1 0 0 0 0-.66a7.5 7.5 0 0 0-13.888 0a1 1 0 0 0 0 .66a7.5 7.5 0 0 0 13.888 0" />
    </svg>
  );
}

/**
 * Tabler DNA-2 icon: Double helix genetics for sow breed and lineage.
 * Sourced via Better Icons (tabler:dna-2)
 */
export function DnaIcon({ className = 'h-5 w-5', size, color, strokeWidth = 2, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size || 24}
      height={size || 24}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M17 3v1q-.015 5.028-5.008 8.014c-3.328 1.99-5 4.662-5.008 8.014v1" />
      <path d="M17 21.014v-1q-.015-5.028-5.008-8.014C8.672 10.023 7 7.352 6.992 4V3M7 4h10M7 20h10M8 8h8m-8 8h8" />
    </svg>
  );
}

/**
 * Tabler Heart Rate Monitor icon: Medical pulse telemetry monitor for health & vitals.
 * Sourced via Better Icons (tabler:heart-rate-monitor)
 */
export function VitalsIcon({ className = 'h-5 w-5', size, color, strokeWidth = 2, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size || 24}
      height={size || 24}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M3 5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zm4 15h10m-8-4v4m6-4v4" />
      <path d="M7 10h2l2 3l2-6l1 3h3" />
    </svg>
  );
}

/**
 * Tabler Scale icon: Measurement balance for animal weight, parity, and stats.
 * Sourced via Better Icons (tabler:scale)
 */
export function ScaleIcon({ className = 'h-5 w-5', size, color, strokeWidth = 2, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size || 24}
      height={size || 24}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M7 20h10M6 6l6-1l6 1m-6-3v17m-3-8L6 6l-3 6a3 3 0 0 0 6 0m12 0l-3-6l-3 6a3 3 0 0 0 6 0" />
    </svg>
  );
}

/**
 * Prisma Atlas Brand Logo: Premium dynamic hexagon prism shield with swine AI crest.
 */
export function PrismaLogoIcon({ className = 'h-8 w-8', size, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size || 32}
      height={size || 32}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      {...props}
    >
      <defs>
        <linearGradient id="prismaGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4f46e5" />
          <stop offset="50%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      {/* Outer Prism Hex Shield */}
      <path
        d="M16 2L28 8.5V20.5L16 29L4 20.5V8.5L16 2Z"
        stroke="url(#prismaGradient)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Swine Silhouette */}
      <path
        d="M11 15C11 12.5 13 10.5 16 10.5C18.5 10.5 20.5 12 21 14H22C22.6 14 23 14.4 23 15V17C23 17.6 22.6 18 22 18H21C20.5 19.5 18.8 20.5 16.5 20.5V22C16.5 22.6 15.5 22.6 15.5 22V20.5C15 20.5 14.5 20.4 14 20.2V22C14 22.6 13 22.6 13 22V19.6C11.8 18.5 11 16.9 11 15Z"
        fill="url(#prismaGradient)"
        fillOpacity="0.22"
        stroke="url(#prismaGradient)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* AI Sensor Vision Dot */}
      <circle cx="18" cy="14" r="1.3" fill="#38bdf8" />
    </svg>
  );
}
