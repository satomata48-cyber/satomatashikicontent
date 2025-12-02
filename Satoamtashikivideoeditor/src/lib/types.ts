// メディアアイテムの型
export interface MediaItem {
  id: string;
  type: 'image' | 'audio' | 'video' | 'subtitle';
  name: string;
  path: string;
  duration?: number; // 秒（音声/動画用）
  thumbnail?: string; // Base64 or URL
  text?: string; // 字幕テキスト用
}

// タイムラインクリップの型
export interface Clip {
  id: string;
  mediaId: string;
  trackId: string;
  startTime: number; // タイムライン上の開始位置（秒）
  duration: number;  // 長さ（秒）
  inPoint: number;   // メディア内の開始位置
  outPoint: number;  // メディア内の終了位置
  // エフェクト用のプロパティ
  opacity?: number;  // 透明度 (0-1)
  blendMode?: string; // 合成モード
}

// トラックタイプ（YMM4方式：画像と音声の2種類）
// 画像トラック: 画像、動画、テキスト、字幕を配置
// 音声トラック: 音声ファイルを配置
// 下のトラックほど手前に表示される（レイヤー番号が大きいほど手前）
export type TrackType = 'image' | 'audio';

// トラックの型
export interface Track {
  id: string;
  type: TrackType;
  name: string;
  clips: Clip[];
  muted: boolean;
  visible: boolean;
  locked?: boolean;  // ロック状態
  order: number;     // 表示順序（上から下へ）
}

// プロジェクトの型
export interface Project {
  name: string;
  width: number;
  height: number;
  fps: number;
  tracks: Track[];
  mediaItems: MediaItem[];
}

// トラックカウンター（ID生成用）
let trackCounters: Record<TrackType, number> = {
  image: 1,
  audio: 1,
};

// トラックタイプの表示名
export const trackTypeNames: Record<TrackType, string> = {
  image: '画像',
  audio: '音声',
};

// 新しいトラックを作成
export function createTrack(type: TrackType, order: number): Track {
  const count = trackCounters[type]++;
  return {
    id: `${type}-${Date.now()}-${count}`,
    type,
    name: `${trackTypeNames[type]} ${count}`,
    clips: [],
    muted: false,
    visible: true,
    locked: false,
    order,
  };
}

// トラックカウンターをリセット
export function resetTrackCounters(): void {
  trackCounters = {
    image: 1,
    audio: 1,
  };
}

// デフォルトプロジェクト
export function createDefaultProject(): Project {
  resetTrackCounters();
  return {
    name: '新規プロジェクト',
    width: 1920,
    height: 1080,
    fps: 30,
    tracks: [
      // 画像トラック（上のトラックが背面、下のトラックが手前）- 3つデフォルトで用意
      { id: 'image-1', type: 'image', name: '画像 1', clips: [], muted: false, visible: true, locked: false, order: 0 },
      { id: 'image-2', type: 'image', name: '画像 2', clips: [], muted: false, visible: true, locked: false, order: 1 },
      { id: 'image-3', type: 'image', name: '画像 3', clips: [], muted: false, visible: true, locked: false, order: 2 },
      // 音声トラック
      { id: 'audio-1', type: 'audio', name: '音声 1', clips: [], muted: false, visible: true, locked: false, order: 100 },
    ],
    mediaItems: [],
  };
}
