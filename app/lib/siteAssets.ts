import "server-only";
import { getSupabaseAdmin } from "./supabase/server";

export const SITE_ASSETS_BUCKET = "site-assets";
export const DEFAULT_HERO_IMAGE =
  "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=1600&q=80";

export type SiteAsset = {
  id: string;
  trade: string;
  assetType: string;
  imageUrl: string;
  storagePath: string;
  altText: string;
  isActive: boolean;
  createdAt: string;
};

export type UploadedLeadHeroImage = {
  imageUrl: string;
  storagePath: string;
};

type SiteAssetRow = {
  id: string;
  trade: string;
  asset_type: string;
  image_url: string;
  storage_path: string;
  alt_text?: string | null;
  is_active: boolean;
  created_at?: string | null;
};

function normalizeKey(value: unknown, fallback: string) {
  const normalized = String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || fallback;
}

function rowToSiteAsset(row: SiteAssetRow): SiteAsset {
  return {
    id: row.id,
    trade: row.trade,
    assetType: row.asset_type,
    imageUrl: row.image_url,
    storagePath: row.storage_path,
    altText: row.alt_text || "",
    isActive: row.is_active,
    createdAt: row.created_at || "",
  };
}

function getFileExtension(fileName: string, contentType: string) {
  const fromName = fileName.split(".").pop()?.toLowerCase() || "";

  if (/^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/gif") return "gif";

  return "jpg";
}

function sanitizeFileBaseName(fileName: string) {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "");
  const sanitized = withoutExtension
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized || "hero-image";
}

export async function getAssetsByTrade(trade: string, assetType = "hero") {
  const supabase = getSupabaseAdmin();
  const normalizedTrade = normalizeKey(trade, "generic");
  const normalizedAssetType = normalizeKey(assetType, "hero");
  const { data, error } = await supabase
    .from("site_assets")
    .select("*")
    .eq("trade", normalizedTrade)
    .eq("asset_type", normalizedAssetType)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return ((data || []) as SiteAssetRow[]).map(rowToSiteAsset);
}

export async function listSiteAssets() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("site_assets")
    .select("*")
    .order("trade", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) throw error;

  return ((data || []) as SiteAssetRow[]).map(rowToSiteAsset);
}

export async function getRandomHeroImage(trade: string) {
  const tradeAssets = await getAssetsByTrade(trade, "hero");
  const assets = tradeAssets.length
    ? tradeAssets
    : await getAssetsByTrade("generic", "hero");

  if (!assets.length) return DEFAULT_HERO_IMAGE;

  return assets[Math.floor(Math.random() * assets.length)].imageUrl;
}

export async function uploadSiteAsset(args: {
  trade: string;
  assetType?: string;
  file: File;
  altText?: string;
}) {
  const supabase = getSupabaseAdmin();
  const trade = normalizeKey(args.trade, "generic");
  const assetType = normalizeKey(args.assetType, "hero");
  const extension = getFileExtension(args.file.name, args.file.type);
  const storagePath = `${trade}/${assetType}/${crypto.randomUUID()}.${extension}`;
  const bytes = await args.file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from(SITE_ASSETS_BUCKET)
    .upload(storagePath, bytes, {
      contentType: args.file.type || "image/jpeg",
      upsert: false,
    });

  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage
    .from(SITE_ASSETS_BUCKET)
    .getPublicUrl(storagePath);
  const { data, error } = await supabase
    .from("site_assets")
    .insert({
      trade,
      asset_type: assetType,
      image_url: publicUrlData.publicUrl,
      storage_path: storagePath,
      alt_text: args.altText?.trim() || null,
      is_active: true,
    })
    .select("*")
    .single();

  if (error) {
    await supabase.storage.from(SITE_ASSETS_BUCKET).remove([storagePath]);
    throw error;
  }

  return rowToSiteAsset(data as SiteAssetRow);
}

export async function uploadSiteAssetBuffer(args: {
  trade: string;
  assetType?: string;
  bytes: Buffer;
  contentType: string;
  extension: string;
  altText?: string;
}) {
  const supabase = getSupabaseAdmin();
  const trade = normalizeKey(args.trade, "generic");
  const assetType = normalizeKey(args.assetType, "hero");
  const extension = normalizeKey(args.extension.replace(/^\./, ""), "webp");
  const storagePath = `${trade}/${assetType}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from(SITE_ASSETS_BUCKET)
    .upload(storagePath, args.bytes, {
      contentType: args.contentType || "image/webp",
      upsert: false,
    });

  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage
    .from(SITE_ASSETS_BUCKET)
    .getPublicUrl(storagePath);
  const { data, error } = await supabase
    .from("site_assets")
    .insert({
      trade,
      asset_type: assetType,
      image_url: publicUrlData.publicUrl,
      storage_path: storagePath,
      alt_text: args.altText?.trim() || null,
      is_active: true,
    })
    .select("*")
    .single();

  if (error) {
    await supabase.storage.from(SITE_ASSETS_BUCKET).remove([storagePath]);
    throw error;
  }

  return rowToSiteAsset(data as SiteAssetRow);
}

export async function uploadLeadHeroImage(args: {
  leadKey: string;
  file: File;
}): Promise<UploadedLeadHeroImage> {
  const supabase = getSupabaseAdmin();
  const leadKey = normalizeKey(args.leadKey, "lead");
  const extension = getFileExtension(args.file.name, args.file.type);
  const fileBaseName = sanitizeFileBaseName(args.file.name);
  const timestamp = Date.now();
  const storagePath = `hero-images/${leadKey}/${timestamp}-${fileBaseName}.${extension}`;
  const bytes = await args.file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from(SITE_ASSETS_BUCKET)
    .upload(storagePath, bytes, {
      contentType: args.file.type || "image/jpeg",
      upsert: false,
    });

  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage
    .from(SITE_ASSETS_BUCKET)
    .getPublicUrl(storagePath);

  return {
    imageUrl: publicUrlData.publicUrl,
    storagePath,
  };
}

export async function uploadLeadSiteBrandingImage(args: {
  leadKey: string;
  file: File;
}): Promise<UploadedLeadHeroImage> {
  const supabase = getSupabaseAdmin();
  const leadKey = normalizeKey(args.leadKey, "lead");
  const extension = getFileExtension(args.file.name, args.file.type);
  const fileBaseName = sanitizeFileBaseName(args.file.name);
  const timestamp = Date.now();
  const storagePath = `site-branding/${leadKey}/${timestamp}-${fileBaseName}.${extension}`;
  const bytes = await args.file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from(SITE_ASSETS_BUCKET)
    .upload(storagePath, bytes, {
      contentType: args.file.type || "image/jpeg",
      upsert: false,
    });

  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage
    .from(SITE_ASSETS_BUCKET)
    .getPublicUrl(storagePath);

  return {
    imageUrl: publicUrlData.publicUrl,
    storagePath,
  };
}

export async function deleteSiteAsset(id: string) {
  const supabase = getSupabaseAdmin();
  const { data: asset, error: lookupError } = await supabase
    .from("site_assets")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (!asset) return null;

  const row = asset as SiteAssetRow;
  const { error: storageError } = await supabase.storage
    .from(SITE_ASSETS_BUCKET)
    .remove([row.storage_path]);

  if (storageError) throw storageError;

  const { error: deleteError } = await supabase
    .from("site_assets")
    .delete()
    .eq("id", id);

  if (deleteError) throw deleteError;

  return rowToSiteAsset(row);
}
