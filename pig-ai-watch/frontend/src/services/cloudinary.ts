const API_BASE = '/api';

export type CloudinaryResourceType = 'video' | 'image' | 'raw' | 'auto';

export interface CloudinaryStatus {
  enabled: boolean;
  cloud_name: string | null;
  folder: string;
}

export interface SignedUploadPayload {
  cloud_name: string;
  api_key: string;
  timestamp: number;
  folder: string;
  public_id: string;
  context: string;
  tags: string;
  signature: string;
  resource_type: CloudinaryResourceType;
  upload_url: string;
}

export interface UploadedAssetInfo {
  asset_id: string;
  public_id: string;
  resource_type: string;
  format: string;
  bytes: number;
  duration?: number;
  width?: number;
  height?: number;
  secure_url: string;
  created_at?: string;
}

const authHeaders = (): HeadersInit => {
  const token = localStorage.getItem('access_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export async function getCloudinaryStatus(): Promise<CloudinaryStatus> {
  const resp = await fetch(`${API_BASE}/media/cloudinary/status`, {
    headers: authHeaders(),
  });
  if (!resp.ok) throw new Error('Failed to fetch Cloudinary status');
  return resp.json();
}

export async function getCloudinarySignedUpload(payload: {
  pen_id?: number;
  clip_type?: string;
  resource_type?: CloudinaryResourceType;
  original_filename?: string;
}): Promise<SignedUploadPayload> {
  const resp = await fetch(`${API_BASE}/media/cloudinary/sign-upload`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      pen_id: payload.pen_id,
      clip_type: payload.clip_type ?? 'replay',
      resource_type: payload.resource_type ?? 'video',
      original_filename: payload.original_filename,
    }),
  });
  if (!resp.ok) {
    const message = await resp.text();
    throw new Error(message || 'Failed to sign Cloudinary upload');
  }
  return resp.json();
}

export async function uploadFileToCloudinary(file: File, options?: {
  pen_id?: number;
  clip_type?: string;
  resource_type?: CloudinaryResourceType;
}): Promise<UploadedAssetInfo> {
  const signed = await getCloudinarySignedUpload({
    pen_id: options?.pen_id,
    clip_type: options?.clip_type,
    resource_type: options?.resource_type ?? 'video',
    original_filename: file.name,
  });

  const formData = new FormData();
  formData.append('file', file);
  formData.append('api_key', signed.api_key);
  formData.append('timestamp', String(signed.timestamp));
  formData.append('signature', signed.signature);
  formData.append('folder', signed.folder);
  formData.append('public_id', signed.public_id);
  formData.append('context', signed.context);
  formData.append('tags', signed.tags);

  const uploadResp = await fetch(signed.upload_url, {
    method: 'POST',
    body: formData,
  });

  if (!uploadResp.ok) {
    const message = await uploadResp.text();
    throw new Error(message || 'Cloudinary upload failed');
  }

  const result = await uploadResp.json();
  return {
    asset_id: result.asset_id,
    public_id: result.public_id,
    resource_type: result.resource_type,
    format: result.format,
    bytes: result.bytes,
    duration: result.duration,
    width: result.width,
    height: result.height,
    secure_url: result.secure_url,
    created_at: result.created_at,
  };
}