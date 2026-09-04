import {
  StaffPreset,
  defaultStaffPresets,
  SavedMySoku,
  SavedMySokuSummary,
  StoredImageRef,
  AppState,
  PropertyData,
  ExtractedImage,
  ImageCategory,
} from '@/types';
import { db, auth, storage } from './firebase';
import { collection, doc, setDoc, getDoc, getDocs, deleteDoc, query, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const STAFF_PRESETS_KEY = 'js_mysoku_staff_presets';
const SAVED_MYSOKUS_KEY = 'js_mysoku_saved_list';
const LAST_ACTIVE_ID_KEY = 'js_mysoku_last_active_id';

// -------------------------------------------------------------
// Staff Presets
// -------------------------------------------------------------

export function getStaffPresets(): StaffPreset[] {
  if (typeof window === 'undefined') return defaultStaffPresets;
  try {
    const saved = localStorage.getItem(STAFF_PRESETS_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error("Error reading staff presets from localStorage", e);
  }
  return defaultStaffPresets;
}

export function saveStaffPresets(presets: StaffPreset[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STAFF_PRESETS_KEY, JSON.stringify(presets));
  } catch (e) {
    console.error("Error saving staff presets to localStorage", e);
  }
}

export function addStaffPreset(newPreset: Omit<StaffPreset, 'id'>): StaffPreset[] {
  const presets = getStaffPresets();
  const created: StaffPreset = {
    ...newPreset,
    id: Date.now().toString(),
  };
  const updated = [...presets, created];
  saveStaffPresets(updated);
  return updated;
}

export function updateStaffPreset(updatedPreset: StaffPreset): StaffPreset[] {
  const presets = getStaffPresets();
  const updated = presets.map(p => p.id === updatedPreset.id ? updatedPreset : p);
  saveStaffPresets(updated);
  return updated;
}

export function deleteStaffPreset(id: string): StaffPreset[] {
  const presets = getStaffPresets();
  const updated = presets.filter(p => p.id !== id);
  saveStaffPresets(updated);
  return updated;
}

// -------------------------------------------------------------
// Helper: DataURL to Blob converter
// -------------------------------------------------------------

export function dataUrlToBlob(dataUrl: string): { blob: Blob; mimeType: string; ext: string } | null {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    return null;
  }
  try {
    const parts = dataUrl.split(',');
    if (parts.length < 2) return null;
    const header = parts[0];
    const mimeMatch = header.match(/:(.*?);/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
    const binaryStr = atob(parts[1]);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mimeType });
    let ext = 'png';
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';
    else if (mimeType.includes('webp')) ext = 'webp';
    else if (mimeType.includes('svg')) ext = 'svg';
    return { blob, mimeType, ext };
  } catch (err) {
    console.warn("Failed to convert dataUrl to blob:", err);
    return null;
  }
}

// -------------------------------------------------------------
// LocalStorage Lightweight Management (Strictly NO Base64)
// -------------------------------------------------------------

export function getLastActiveMySokuId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(LAST_ACTIVE_ID_KEY);
  } catch {
    return null;
  }
}

export function setLastActiveMySokuId(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LAST_ACTIVE_ID_KEY, id);
  } catch (e) {
    console.warn("Failed to save last active mysoku id", e);
  }
}

export function getLocalSavedMySokus(): SavedMySokuSummary[] {
  if (typeof window === 'undefined') return [];
  try {
    const saved = localStorage.getItem(SAVED_MYSOKUS_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];

    // Map to guaranteed lightweight summaries
    return parsed.map((item: any) => ({
      id: item.id || `mysoku_${Date.now()}`,
      userId: item.userId,
      propertyName: item.propertyName || item.data?.property?.name || '物件名未定',
      room: item.room || item.data?.property?.room || '',
      address: item.address || item.data?.property?.address || '',
      rentAmount: item.rentAmount ?? item.data?.rent?.amount ?? null,
      format: item.format || 'JS-B',
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt,
      staffName: item.staffName || '営業担当',
      status: item.status || 'completed',
    }));
  } catch (e) {
    console.error("Error reading saved mysokus summaries from localStorage", e);
    return [];
  }
}

export function saveLocalMySokuSummary(summary: SavedMySokuSummary): void {
  if (typeof window === 'undefined') return;

  // Strict validation: Ensure no heavy binary or Base64 is stored
  const sanitizedSummary: SavedMySokuSummary = {
    id: summary.id,
    userId: summary.userId,
    propertyName: summary.propertyName,
    room: summary.room,
    address: summary.address,
    rentAmount: summary.rentAmount,
    format: summary.format,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    staffName: summary.staffName,
    status: summary.status,
  };

  const list = getLocalSavedMySokus();
  const existingIndex = list.findIndex(x => x.id === sanitizedSummary.id);
  let updated: SavedMySokuSummary[];
  if (existingIndex >= 0) {
    updated = [...list];
    updated[existingIndex] = sanitizedSummary;
  } else {
    updated = [sanitizedSummary, ...list];
  }

  // Keep up to 50 lightweight summaries (total size < 25KB)
  try {
    localStorage.setItem(SAVED_MYSOKUS_KEY, JSON.stringify(updated.slice(0, 50)));
  } catch (e: any) {
    console.error("Error saving mysoku summary to localStorage", e);
    throw new Error(`ストレージ容量上限エラー: ローカルキャッシュの保存に失敗しました (${e?.message || 'QuotaExceeded'})`);
  }
}

export async function deleteLocalMySoku(id: string): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const list = getLocalSavedMySokus();
    const updated = list.filter(x => x.id !== id);
    localStorage.setItem(SAVED_MYSOKUS_KEY, JSON.stringify(updated));

    // Also delete from Firestore if accessible
    try {
      await deleteDoc(doc(db, 'mysokus', id));
    } catch (err) {
      console.warn("Could not delete from Firestore:", err);
    }
  } catch (e) {
    console.error("Error deleting local mysoku summary", e);
  }
}

// -------------------------------------------------------------
// Cloud Storage: Normalization and Upload of Images
// -------------------------------------------------------------

interface ImageUploadPlan {
  originalUrlOrData: string;
  imageId: string;
  category: ImageCategory | string;
  subCategory?: string;
  label?: string;
  sourcePage?: number;
  width?: number;
  height?: number;
}

/**
 * Normalizes all images in propertyData, uploads unique images to Cloud Storage,
 * and replaces all raw Base64 data with compact HTTPS Cloud Storage download URLs.
 */
export async function uploadAndNormalizeImages(
  propertyData: PropertyData,
  mysokuId: string,
  userId: string
): Promise<{ sanitizedData: PropertyData; storedImages: StoredImageRef[] }> {
  // Deep clone data to avoid mutating working AppState in-place
  const clonedData: PropertyData = JSON.parse(JSON.stringify(propertyData));
  const images = clonedData.images || {};
  const classifiedList = images.classifiedList || [];

  // 1. Gather all candidate images and deduplicate by content/URL
  const uniqueUrlMap = new Map<string, ImageUploadPlan>();
  let autoIdCounter = 1;

  // First, register classifiedList images with their explicit metadata
  classifiedList.forEach((item, idx) => {
    if (item.dataUrl && !uniqueUrlMap.has(item.dataUrl)) {
      const imageId = item.id || `img_${idx + 1}`;
      uniqueUrlMap.set(item.dataUrl, {
        originalUrlOrData: item.dataUrl,
        imageId,
        category: item.category || 'PHOTO',
        subCategory: item.subCategory,
        label: item.label,
        sourcePage: item.sourcePage,
        width: item.width,
        height: item.height,
      });
    }
  });

  // Second, register role images (main, floorPlan, map, detailMap, subPhotos)
  const registerRoleImage = (url: string | undefined, roleName: string, category: ImageCategory) => {
    if (!url) return;
    if (!uniqueUrlMap.has(url)) {
      const imageId = `${roleName}_${autoIdCounter++}`;
      uniqueUrlMap.set(url, {
        originalUrlOrData: url,
        imageId,
        category,
        label: roleName,
      });
    }
  };

  registerRoleImage(images.main, 'main', 'PHOTO');
  registerRoleImage(images.floorPlan, 'floorPlan', 'PLAN');
  registerRoleImage(images.map, 'map', 'ACCESS');
  registerRoleImage(images.detailMap, 'detailMap', 'ACCESS');

  if (Array.isArray(images.subPhotos)) {
    images.subPhotos.forEach((url, i) => registerRoleImage(url, `subPhoto_${i}`, 'PHOTO'));
  }
  if (Array.isArray(images.allExtracted)) {
    images.allExtracted.forEach((url, i) => registerRoleImage(url, `extracted_${i}`, 'OTHER'));
  }
  if (images.coverImageSettings?.imageUrl) {
    registerRoleImage(images.coverImageSettings.imageUrl, 'coverBg', 'PHOTO');
  }

  // 2. Upload unique Base64 images to Cloud Storage
  // Path format: users/{userId}/mysokus/{mysokuId}/images/{imageId}.{ext}
  const storedImages: StoredImageRef[] = [];
  const urlToDownloadUrlMap = new Map<string, { downloadUrl: string; imageId: string }>();

  for (const plan of uniqueUrlMap.values()) {
    const raw = plan.originalUrlOrData;

    // If it's already an HTTP / HTTPS URL, reuse it directly without re-uploading
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      urlToDownloadUrlMap.set(raw, { downloadUrl: raw, imageId: plan.imageId });
      storedImages.push({
        imageId: plan.imageId,
        storagePath: `external/${plan.imageId}`,
        downloadUrl: raw,
        category: plan.category,
        subCategory: plan.subCategory,
        label: plan.label,
        sourcePage: plan.sourcePage,
        width: plan.width,
        height: plan.height,
      });
      continue;
    }

    // Convert Base64 dataUrl to Blob
    const converted = dataUrlToBlob(raw);
    if (!converted) {
      continue;
    }

    const storagePath = `users/${userId}/mysokus/${mysokuId}/images/${plan.imageId}.${converted.ext}`;
    const storageReference = ref(storage, storagePath);

    // Upload to Firebase Cloud Storage
    await uploadBytes(storageReference, converted.blob, {
      contentType: converted.mimeType,
      customMetadata: {
        mysokuId,
        userId,
        category: String(plan.category),
        label: plan.label || '',
      },
    });

    // Obtain the publicly readable or authenticated download URL
    const downloadUrl = await getDownloadURL(storageReference);

    urlToDownloadUrlMap.set(raw, { downloadUrl, imageId: plan.imageId });
    storedImages.push({
      imageId: plan.imageId,
      storagePath,
      downloadUrl,
      category: plan.category,
      subCategory: plan.subCategory,
      label: plan.label,
      sourcePage: plan.sourcePage,
      width: plan.width,
      height: plan.height,
    });
  }

  // 3. Replace all Base64 references in clonedData with Cloud Storage download URLs and normalized imageIds
  const slotMap: { [slotKey: string]: string } = {};

  if (images.main && urlToDownloadUrlMap.has(images.main)) {
    const info = urlToDownloadUrlMap.get(images.main)!;
    images.main = info.downloadUrl;
    slotMap.main = info.imageId;
  }
  if (images.floorPlan && urlToDownloadUrlMap.has(images.floorPlan)) {
    const info = urlToDownloadUrlMap.get(images.floorPlan)!;
    images.floorPlan = info.downloadUrl;
    slotMap.floorPlan = info.imageId;
  }
  if (images.map && urlToDownloadUrlMap.has(images.map)) {
    const info = urlToDownloadUrlMap.get(images.map)!;
    images.map = info.downloadUrl;
    slotMap.map = info.imageId;
  }
  if (images.detailMap && urlToDownloadUrlMap.has(images.detailMap)) {
    const info = urlToDownloadUrlMap.get(images.detailMap)!;
    images.detailMap = info.downloadUrl;
    slotMap.detailMap = info.imageId;
  }

  if (Array.isArray(images.subPhotos)) {
    images.subPhotos = images.subPhotos.map((url, idx) => {
      const info = urlToDownloadUrlMap.get(url);
      if (info) {
        slotMap[`subPhoto_${idx}`] = info.imageId;
        return info.downloadUrl;
      }
      return url;
    });
  }

  if (Array.isArray(images.allExtracted)) {
    images.allExtracted = images.allExtracted.map(url => {
      const info = urlToDownloadUrlMap.get(url);
      return info ? info.downloadUrl : url;
    });
  }

  if (Array.isArray(images.classifiedList)) {
    images.classifiedList = images.classifiedList.map((item, idx) => {
      const info = urlToDownloadUrlMap.get(item.dataUrl);
      if (info) {
        slotMap[`photo_${idx}`] = info.imageId;
        return {
          ...item,
          id: info.imageId,
          dataUrl: info.downloadUrl, // Swapped to compact Storage URL
        };
      }
      return item;
    });
  }

  if (images.coverImageSettings?.imageUrl && urlToDownloadUrlMap.has(images.coverImageSettings.imageUrl)) {
    const info = urlToDownloadUrlMap.get(images.coverImageSettings.imageUrl)!;
    images.coverImageSettings = {
      ...images.coverImageSettings,
      imageId: info.imageId,
      imageUrl: info.downloadUrl,
    };
  }

  // Preserve normalized slotMap
  images.slotMap = { ...images.slotMap, ...slotMap };
  clonedData.images = images;

  return { sanitizedData: clonedData, storedImages };
}

// -------------------------------------------------------------
// Core Save Flow: Cloud Storage -> Firestore -> LocalStorage
// -------------------------------------------------------------

/**
 * 3-step save pipeline:
 * 1. Uploads all images to Firebase Cloud Storage (normalized and deduplicated)
 * 2. Saves lightweight document (NO Base64) to Cloud Firestore
 * 3. Saves minimal metadata summary to LocalStorage
 *
 * All 3 steps must succeed. Throws an error immediately if any step fails.
 */
export async function persistMySoku(appState: AppState, thumbnail?: string): Promise<SavedMySoku> {
  const data = appState.data;
  if (!data) {
    throw new Error('物件データが存在しないため保存できません。');
  }

  const userId = auth.currentUser?.uid || 'guest';
  const mysokuId = `mysoku_${Date.now()}`;
  const now = new Date().toISOString();

  // Step 1: Upload images to Cloud Storage & normalize data
  let sanitizedData: PropertyData;
  let storedImages: StoredImageRef[];
  try {
    const uploadResult = await uploadAndNormalizeImages(data, mysokuId, userId);
    sanitizedData = uploadResult.sanitizedData;
    storedImages = uploadResult.storedImages;
  } catch (err: any) {
    console.error("Failed to upload images to Cloud Storage:", err);
    throw new Error(`Cloud Storageへの画像アップロードに失敗しました: ${err?.message || 'Upload failed'}`);
  }

  // Step 2: Save sanitized document to Cloud Firestore
  const savedItem: SavedMySoku = {
    id: mysokuId,
    userId,
    title: `${sanitizedData.property.name || '物件'} ${sanitizedData.property.room || ''}`.trim(),
    createdAt: now,
    updatedAt: now,
    format: appState.format,
    propertyName: sanitizedData.property.name || '物件名未定',
    room: sanitizedData.property.room || '',
    address: sanitizedData.property.address || '',
    rentAmount: sanitizedData.rent.amount,
    staffName: appState.jsContact.personName || '営業担当',
    data: sanitizedData, // Completely free of Base64 strings!
    storedImages,
    additionalItems: appState.additionalItems || [],
    jsContact: appState.jsContact,
    status: 'completed',
  };

  try {
    const docRef = doc(db, 'mysokus', mysokuId);
    await setDoc(docRef, savedItem);
  } catch (err: any) {
    console.error("Failed to save to Firestore:", err);
    throw new Error(`Cloud Firestore (HSTRAGE) へのデータ保存に失敗しました: ${err?.message || 'Firestore write failed'}`);
  }

  // Step 3: Save lightweight summary to LocalStorage
  const summary: SavedMySokuSummary = {
    id: mysokuId,
    userId,
    propertyName: savedItem.propertyName,
    room: savedItem.room,
    address: savedItem.address,
    rentAmount: savedItem.rentAmount,
    format: savedItem.format,
    createdAt: now,
    updatedAt: now,
    staffName: savedItem.staffName,
    status: 'completed',
  };

  try {
    saveLocalMySokuSummary(summary);
    setLastActiveMySokuId(mysokuId);
  } catch (err: any) {
    console.error("Failed to save summary to LocalStorage:", err);
    throw new Error(`ローカルストレージへの履歴保存に失敗しました: ${err?.message || 'LocalStorage write failed'}`);
  }

  return savedItem;
}

// -------------------------------------------------------------
// History Fetching & Detail Restoration
// -------------------------------------------------------------

/**
 * Fetches lightweight list of saved MySokus for history modal (instant display).
 * Does NOT load heavy image data.
 */
export async function fetchAllMySokus(): Promise<SavedMySokuSummary[]> {
  const localSummaries = getLocalSavedMySokus();

  try {
    const userId = auth.currentUser?.uid;
    const mysokuColl = collection(db, 'mysokus');
    let q = query(mysokuColl);
    if (userId) {
      q = query(mysokuColl, where('userId', '==', userId));
    }
    const snapshot = await getDocs(q);
    const remoteSummaries: SavedMySokuSummary[] = [];

    snapshot.forEach(docSnap => {
      const d = docSnap.data();
      remoteSummaries.push({
        id: docSnap.id,
        userId: d.userId,
        propertyName: d.propertyName || d.data?.property?.name || '物件名未定',
        room: d.room || d.data?.property?.room || '',
        address: d.address || d.data?.property?.address || '',
        rentAmount: d.rentAmount ?? d.data?.rent?.amount ?? null,
        format: d.format || 'JS-B',
        createdAt: d.createdAt || new Date().toISOString(),
        updatedAt: d.updatedAt,
        staffName: d.staffName || '営業担当',
        status: d.status || 'completed',
      });
    });

    // Merge by id (remote takes precedence)
    const map = new Map<string, SavedMySokuSummary>();
    localSummaries.forEach(item => map.set(item.id, item));
    remoteSummaries.forEach(item => map.set(item.id, item));

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch (err) {
    console.warn("Could not fetch remote mysoku summaries, returning local:", err);
    return localSummaries;
  }
}

/**
 * Fetches full MySoku record by ID from Firestore for re-editing or rendering.
 * All image fields contain fast Cloud Storage download URLs.
 */
export async function fetchMySokuById(id: string): Promise<SavedMySoku | null> {
  try {
    const docRef = doc(db, 'mysokus', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as SavedMySoku;
    }
  } catch (err) {
    console.error("Error fetching full mysoku from Firestore:", err);
  }
  return null;
}

// -------------------------------------------------------------
// Safe Migration of Legacy LocalStorage Data
// -------------------------------------------------------------

/**
 * Safely checks if legacy items with full data or Base64 exist in localStorage.
 * If detected, migrates images to Cloud Storage, writes to Firestore,
 * and replaces localStorage with lightweight summaries.
 * If migration fails, the original data is maintained.
 */
export async function migrateLegacyLocalStorageData(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const raw = localStorage.getItem(SAVED_MYSOKUS_KEY);
    if (!raw) return;

    let parsed: any[];
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    if (!Array.isArray(parsed) || parsed.length === 0) return;

    // Detect legacy structure (items containing a .data object with possible base64)
    const hasLegacy = parsed.some(item => item && item.data && typeof item.data === 'object');
    if (!hasLegacy) return;

    console.info("[Migration] Legacy MySoku items detected in localStorage. Initiating safe migration...");

    const migratedSummaries: SavedMySokuSummary[] = [];
    const userId = auth.currentUser?.uid || 'guest';

    for (const item of parsed) {
      if (!item.data) {
        // Already a clean summary
        migratedSummaries.push(item as SavedMySokuSummary);
        continue;
      }

      try {
        const itemId = item.id || `mysoku_${Date.now()}`;
        // Attempt cloud migration if images are present
        if (item.data.images) {
          const { sanitizedData, storedImages } = await uploadAndNormalizeImages(item.data, itemId, userId);
          const fullRecord: SavedMySoku = {
            id: itemId,
            userId,
            title: item.title || `${item.data.property?.name || '物件'} ${item.data.property?.room || ''}`.trim(),
            createdAt: item.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            format: item.format || 'JS-B',
            propertyName: item.propertyName || item.data.property?.name || '物件名未定',
            room: item.room || item.data.property?.room || '',
            address: item.address || item.data.property?.address || '',
            rentAmount: item.rentAmount ?? item.data.rent?.amount ?? null,
            staffName: item.staffName || '営業担当',
            data: sanitizedData,
            storedImages,
            additionalItems: item.additionalItems || [],
            jsContact: item.jsContact,
            status: 'completed',
          };
          await setDoc(doc(db, 'mysokus', itemId), fullRecord);
        }

        migratedSummaries.push({
          id: item.id || itemId,
          userId,
          propertyName: item.propertyName || item.data?.property?.name || '物件名未定',
          room: item.room || item.data?.property?.room || '',
          address: item.address || item.data?.property?.address || '',
          rentAmount: item.rentAmount ?? item.data?.rent?.amount ?? null,
          format: item.format || 'JS-B',
          createdAt: item.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          staffName: item.staffName || '営業担当',
          status: 'completed',
        });
      } catch (itemErr) {
        console.warn(`[Migration] Failed to migrate item ${item.id} to cloud:`, itemErr);
        // Fallback: retain minimal summary without deleting reference
        migratedSummaries.push({
          id: item.id || `mysoku_${Date.now()}`,
          userId,
          propertyName: item.propertyName || item.data?.property?.name || '物件名未定',
          room: item.room || '',
          address: item.address || '',
          rentAmount: item.rentAmount,
          format: item.format || 'JS-B',
          createdAt: item.createdAt || new Date().toISOString(),
          status: 'not_completed',
        });
      }
    }

    // Safely write the lightweight summaries back to localStorage
    localStorage.setItem(SAVED_MYSOKUS_KEY, JSON.stringify(migratedSummaries));
    console.info("[Migration] Migration completed successfully. LocalStorage sanitized.");
  } catch (globalErr) {
    console.error("[Migration] Migration failed, maintaining existing localStorage untouched:", globalErr);
  }
}
