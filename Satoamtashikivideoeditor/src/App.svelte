<script lang="ts">
  import type { Project, MediaItem, Clip, Track, TrackType } from './lib/types';
  import { createDefaultProject, createTrack, trackTypeNames } from './lib/types';
  import { FFmpeg } from '@ffmpeg/ffmpeg';
  import { fetchFile } from '@ffmpeg/util';
  import { Muxer, ArrayBufferTarget } from 'webm-muxer';

  // FFmpegインスタンス
  let ffmpeg: FFmpeg | null = null;
  let ffmpegLoaded = $state(false);

  // ブラウザ用File System Access API
  let directoryHandle: FileSystemDirectoryHandle | null = null;

  // 画像トラック追加（YMM4方式：+ボタンで追加）

  // content-generatorのVideoProjectSaveData型
  interface VideoSection {
    id: string;
    heading: string;
    headingLevel: number;
    textContent: string;
    script: string;
    selectedSlideId?: string;
    visualType: string;
    audioFileName?: string;
    imageFileName?: string;
  }

  interface SlideElement {
    id: string;
    type: 'rect' | 'text' | 'image';
    x: number;
    y: number;
    width?: number;
    height?: number;
    fill?: string;
    text?: string;
    fontSize?: number;
    fontFamily?: string;
    fontStyle?: string;
    align?: string;
    src?: string;
  }

  interface Slide {
    id: string;
    name: string;
    elements: SlideElement[];
    background?: { fill?: string };
  }

  // 字幕エントリの型
  interface SubtitleEntry {
    id: string;
    sectionId: string;
    startTime: number; // 秒
    endTime: number;   // 秒
    text: string;
  }

  // 字幕設定の型
  interface SubtitleSettings {
    maxCharsPerLine: number;
    playbackRate: number;
    splitByPunctuation: boolean;
  }

  interface VideoProjectSaveData {
    sections: VideoSection[];
    sourceHtmlFileName?: string;
    speakerId: number;
    updatedAt: string;
    subtitles?: SubtitleEntry[];
    subtitleSettings?: SubtitleSettings;
    slidePresentation?: {
      id: string;
      name?: string;
      slides: Slide[];
    };
  }

  // スライドをキャンバスに描画してdata URLを返す
  function renderSlideToDataUrl(slide: Slide): string {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 1280;
    tempCanvas.height = 720;
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return '';

    ctx.fillStyle = slide.background?.fill || '#ffffff';
    ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    for (const elem of slide.elements) {
      if (elem.type === 'rect') {
        ctx.fillStyle = elem.fill || '#000000';
        ctx.fillRect(elem.x, elem.y, elem.width || 0, elem.height || 0);
      } else if (elem.type === 'text' && elem.text) {
        ctx.fillStyle = elem.fill || '#000000';
        const fontStyle = elem.fontStyle === 'bold' ? 'bold ' : '';
        ctx.font = `${fontStyle}${elem.fontSize || 16}px ${elem.fontFamily || 'sans-serif'}`;
        ctx.textAlign = (elem.align as CanvasTextAlign) || 'left';
        ctx.textBaseline = 'middle';
        const cleanText = elem.text.replace(/<[^>]*>/g, '');
        ctx.fillText(cleanText, elem.x, elem.y);
      }
    }

    return tempCanvas.toDataURL('image/png');
  }

  // プロジェクト状態
  let project = $state<Project>(createDefaultProject());
  let currentTime = $state(0);
  let isPlaying = $state(false);
  let zoom = $state(50);
  let selectedClipId = $state<string | null>(null);
  let canvas: HTMLCanvasElement;
  let playInterval: number | null = null;
  const loadedImages = new Map<string, HTMLImageElement>();
  let isExporting = $state(false);
  let exportProgress = $state('');
  let isImporting = $state(false);

  // 再生速度（1.0 = 通常、2.0 = 2倍速）
  let playbackRate = $state(1.0);
  const playbackRates = [0.5, 1.0, 1.5, 2.0];

  // 字幕データ
  let subtitles = $state<SubtitleEntry[]>([]);
  let subtitleSettings = $state<SubtitleSettings | null>(null);
  let showSubtitles = $state(true);

  // 現在の時間に該当する字幕を取得
  function getCurrentSubtitle(): SubtitleEntry | null {
    if (!showSubtitles || subtitles.length === 0) return null;
    for (const entry of subtitles) {
      if (currentTime >= entry.startTime && currentTime < entry.endTime) {
        return entry;
      }
    }
    return null;
  }

  // 字幕テキストを描画する共通関数
  function drawSubtitleText(ctx: CanvasRenderingContext2D, text: string) {
    const padding = 16;
    const fontSize = 24;
    const lineHeight = fontSize * 1.4;

    ctx.font = `bold ${fontSize}px "Noto Sans JP", "Yu Gothic", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    const lines = text.split('\n');
    const totalHeight = lines.length * lineHeight;
    const startY = canvas.height - padding - totalHeight + lineHeight;

    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      const y = startY + i * lineHeight;

      const metrics = ctx.measureText(lineText);
      const bgWidth = metrics.width + padding * 2;
      const bgHeight = lineHeight;
      const bgX = (canvas.width - bgWidth) / 2;
      const bgY = y - lineHeight + 4;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(bgX, bgY, bgWidth, bgHeight);

      ctx.fillStyle = '#ffffff';
      ctx.fillText(lineText, canvas.width / 2, y);
    }
  }

  // タイムラインリサイズ
  let timelineHeight = $state(350); // デフォルト350px

  // デフォルトトラック高さ
  const DEFAULT_TRACK_HEIGHT = 60;

  // トラック高さ（トラックIDごとに管理）
  let trackHeights = $state<Record<string, number>>({});

  function getTrackHeight(trackId: string): number {
    return trackHeights[trackId] || DEFAULT_TRACK_HEIGHT;
  }

  // 全トラックの合計高さを計算
  function getTotalTracksHeight(): number {
    const rulerHeight = 24;
    const headerHeight = 32;
    let total = rulerHeight + headerHeight;
    for (const track of project.tracks) {
      total += getTrackHeight(track.id);
    }
    return total;
  }

  function startTrackResize(e: MouseEvent, trackId: string) {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startHeight = getTrackHeight(trackId);

    function onMouseMove(e: MouseEvent) {
      const delta = e.clientY - startY;
      trackHeights = { ...trackHeights, [trackId]: Math.max(30, Math.min(200, startHeight + delta)) };
    }

    function onMouseUp() {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  function startTimelineResize(e: MouseEvent) {
    e.preventDefault();
    const startY = e.clientY;
    // autoの場合は現在の実際の高さを取得
    const timelineElement = (e.target as HTMLElement).parentElement;
    const startHeight = timelineHeight > 0 ? timelineHeight : (timelineElement?.offsetHeight || getTotalTracksHeight());

    function onMouseMove(e: MouseEvent) {
      const delta = startY - e.clientY;
      timelineHeight = Math.max(100, Math.min(800, startHeight + delta));
    }

    function onMouseUp() {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  const audioElements = new Map<string, HTMLAudioElement>();
  const audioBlobUrls = new Map<string, string>();

  // エクスポート設定
  interface ExportSettings {
    width: number;
    height: number;
    fps: number;
    videoBitrate: number;
    audioBitrate: number;
  }

  const exportPresets: Record<string, ExportSettings> = {
    'youtube-1080p': { width: 1920, height: 1080, fps: 30, videoBitrate: 8000000, audioBitrate: 128000 },
    'youtube-720p': { width: 1280, height: 720, fps: 30, videoBitrate: 5000000, audioBitrate: 128000 },
    'youtube-480p': { width: 854, height: 480, fps: 30, videoBitrate: 2500000, audioBitrate: 128000 },
  };

  let showExportDialog = $state(false);
  let selectedPreset = $state('youtube-1080p');
  let downloadBatchFile = $state(true); // バッチファイルも一緒にダウンロード（デフォルトON）

  // FFmpegを初期化
  async function loadFFmpeg(): Promise<void> {
    if (ffmpegLoaded && ffmpeg) return;

    ffmpeg = new FFmpeg();
    ffmpeg.on('progress', ({ progress }) => {
      exportProgress = `MP4変換中... ${Math.round(progress * 100)}%`;
    });

    await ffmpeg.load({
      coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js',
      wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm',
    });

    ffmpegLoaded = true;
  }

  // WebMをMP4に変換
  async function convertWebMToMP4(webmBlob: Blob): Promise<Blob> {
    if (!ffmpeg) throw new Error('FFmpeg not loaded');

    const webmData = await fetchFile(webmBlob);
    await ffmpeg.writeFile('input.webm', webmData);

    await ffmpeg.exec([
      '-i', 'input.webm',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      'output.mp4'
    ]);

    const mp4Data = await ffmpeg.readFile('output.mp4');
    await ffmpeg.deleteFile('input.webm');
    await ffmpeg.deleteFile('output.mp4');

    return new Blob([mp4Data], { type: 'video/mp4' });
  }

  // WebCodecs APIのサポート確認
  function isWebCodecsSupported(): boolean {
    return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
  }

  // ハードウェアエンコーダーが利用可能かチェック
  async function checkHardwareEncoderSupport(width: number, height: number): Promise<boolean> {
    if (!isWebCodecsSupported()) return false;

    try {
      const config = {
        codec: 'vp09.00.10.08', // VP9
        width,
        height,
        bitrate: 8000000,
        framerate: 30,
        hardwareAcceleration: 'prefer-hardware' as HardwareAcceleration,
      };

      const support = await VideoEncoder.isConfigSupported(config);
      return support.supported === true;
    } catch {
      return false;
    }
  }

  // 画像をプリロード（エクスポート前に全画像を読み込む）
  async function preloadAllImages(): Promise<void> {
    const imageMedia = project.mediaItems.filter(m => m.type === 'image');
    for (const media of imageMedia) {
      try {
        await loadImage(media.path);
        console.log('Preloaded image:', media.name);
      } catch (e) {
        console.error('Failed to preload image:', media.name, e);
      }
    }
  }

  // フレームを描画する関数（エクスポート用）
  async function renderFrameToCanvas(
    ctx: CanvasRenderingContext2D,
    targetCanvas: HTMLCanvasElement,
    time: number
  ) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);

    // 指定時間のクリップを取得
    const clips: { clip: Clip; media: MediaItem; track: Track }[] = [];
    const sortedTracks = [...project.tracks]
      .filter(t => t.type === 'image' && t.visible)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    for (const track of sortedTracks) {
      for (const clip of track.clips) {
        if (time >= clip.startTime && time < clip.startTime + clip.duration) {
          const media = project.mediaItems.find(m => m.id === clip.mediaId);
          if (media) {
            clips.push({ clip, media, track });
          }
        }
      }
    }

    // デバッグ: クリップが見つからない場合
    if (clips.length === 0 && time < 1) {
      console.log('No clips found at time:', time, 'Total tracks:', project.tracks.length);
    }

    // クリップを描画
    for (const { media, clip } of clips) {
      if (media.type === 'image') {
        try {
          // キャッシュから取得、なければ読み込み
          let img = loadedImages.get(media.path);
          if (!img) {
            img = await loadImage(media.path);
          }

          const scale = Math.min(targetCanvas.width / img.width, targetCanvas.height / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          const x = (targetCanvas.width - w) / 2;
          const y = (targetCanvas.height - h) / 2;

          const opacity = clip.opacity ?? 1;
          ctx.globalAlpha = opacity;
          ctx.drawImage(img, x, y, w, h);
          ctx.globalAlpha = 1;
        } catch (e) {
          console.error('Failed to draw image:', media.name, e);
          // エラー時にプレースホルダーを表示
          ctx.fillStyle = '#f38ba8';
          ctx.font = '24px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`画像エラー: ${media.name}`, targetCanvas.width / 2, targetCanvas.height / 2);
        }
      } else if (media.type === 'subtitle' && media.text) {
        // 字幕の描画
        drawSubtitleOnCanvas(ctx, targetCanvas, media.text);
      }
    }

    // 字幕データから描画
    if (showSubtitles && subtitles.length > 0) {
      let subtitle: SubtitleEntry | null = null;
      for (const entry of subtitles) {
        if (time >= entry.startTime && time < entry.endTime) {
          subtitle = entry;
          break;
        }
      }

      if (subtitle) {
        drawSubtitleOnCanvas(ctx, targetCanvas, subtitle.text);
      }
    }
  }

  // 字幕をキャンバスに描画する共通関数（エクスポート用）
  function drawSubtitleOnCanvas(ctx: CanvasRenderingContext2D, targetCanvas: HTMLCanvasElement, text: string) {
    const padding = 16 * (targetCanvas.width / 640);
    const fontSize = 24 * (targetCanvas.width / 640);
    const lineHeight = fontSize * 1.4;

    ctx.font = `bold ${fontSize}px "Noto Sans JP", "Yu Gothic", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    const lines = text.split('\n');
    const totalHeight = lines.length * lineHeight;
    const startY = targetCanvas.height - padding - totalHeight + lineHeight;

    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      const y = startY + i * lineHeight;

      const metrics = ctx.measureText(lineText);
      const bgWidth = metrics.width + padding * 2;
      const bgHeight = lineHeight;
      const bgX = (targetCanvas.width - bgWidth) / 2;
      const bgY = y - lineHeight + 4;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(bgX, bgY, bgWidth, bgHeight);

      ctx.fillStyle = '#ffffff';
      ctx.fillText(lineText, targetCanvas.width / 2, y);
    }
  }

  // AudioBufferをWAVファイルに変換
  function audioBufferToWav(buffer: AudioBuffer): Blob {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;

    const dataLength = buffer.length * blockAlign;
    const bufferLength = 44 + dataLength;

    const arrayBuffer = new ArrayBuffer(bufferLength);
    const view = new DataView(arrayBuffer);

    // WAVヘッダー
    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, bufferLength - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);

    // オーディオデータ
    const channels: Float32Array[] = [];
    for (let i = 0; i < numChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }

    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = Math.max(-1, Math.min(1, channels[ch][i]));
        const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset, intSample, true);
        offset += 2;
      }
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  // 音声をミックスしてAudioBufferを作成
  async function createMixedAudioBuffer(duration: number, sampleRate: number = 44100): Promise<AudioBuffer | null> {
    const audioContext = new AudioContext({ sampleRate });
    const audioTrack = project.tracks.find(t => t.type === 'audio');

    if (!audioTrack || audioTrack.clips.length === 0) {
      return null;
    }

    const totalSamples = Math.ceil(duration * sampleRate);
    const mixedBuffer = audioContext.createBuffer(2, totalSamples, sampleRate);
    const leftChannel = mixedBuffer.getChannelData(0);
    const rightChannel = mixedBuffer.getChannelData(1);

    for (const clip of audioTrack.clips) {
      const media = project.mediaItems.find(m => m.id === clip.mediaId);
      if (!media || media.type !== 'audio') continue;

      try {
        // 音声ファイルをフェッチしてデコード
        const response = await fetch(media.path);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        const clipStartSample = Math.floor(clip.startTime * sampleRate);
        const inPointSample = Math.floor(clip.inPoint * sampleRate);
        const clipDurationSamples = Math.floor(clip.duration * sampleRate);

        const sourceLeft = audioBuffer.getChannelData(0);
        const sourceRight = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : sourceLeft;

        for (let i = 0; i < clipDurationSamples; i++) {
          const destIndex = clipStartSample + i;
          const srcIndex = inPointSample + i;

          if (destIndex >= 0 && destIndex < totalSamples && srcIndex >= 0 && srcIndex < sourceLeft.length) {
            leftChannel[destIndex] += sourceLeft[srcIndex];
            rightChannel[destIndex] += sourceRight[srcIndex];
          }
        }
      } catch (e) {
        console.warn('Failed to process audio clip:', e);
      }
    }

    // クリッピング防止
    for (let i = 0; i < totalSamples; i++) {
      leftChannel[i] = Math.max(-1, Math.min(1, leftChannel[i]));
      rightChannel[i] = Math.max(-1, Math.min(1, rightChannel[i]));
    }

    await audioContext.close();
    return mixedBuffer;
  }

  // 動画をエクスポート
  async function exportVideo() {
    const totalDuration = getTotalDuration();
    if (totalDuration <= 0) {
      alert('エクスポートするコンテンツがありません');
      return;
    }

    // MediaRecorderのサポート確認
    if (!MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
      if (!MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
        alert('このブラウザはMediaRecorder APIに対応していません');
        return;
      }
    }

    showExportDialog = true;
  }

  // WebCodecs APIを使った高速エクスポート（GPUアクセラレーション対応）
  async function startExportWithWebCodecs() {
    const settings = exportPresets[selectedPreset];
    const totalDuration = getTotalDuration();
    const fps = settings.fps;
    const totalFrames = Math.ceil(totalDuration * fps);

    // エクスポート用キャンバス作成
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = settings.width;
    exportCanvas.height = settings.height;
    const exportCtx = exportCanvas.getContext('2d', { willReadFrequently: false })!;

    // エンコードされたチャンク保存用
    const encodedChunks: EncodedVideoChunk[] = [];

    // VideoEncoderの設定（GPUアクセラレーション優先）
    const encoderConfig: VideoEncoderConfig = {
      codec: 'vp09.00.10.08', // VP9 Profile 0, Level 1.0
      width: settings.width,
      height: settings.height,
      bitrate: settings.videoBitrate,
      framerate: fps,
      hardwareAcceleration: 'prefer-hardware',
    };

    // エンコーダーの設定確認
    const support = await VideoEncoder.isConfigSupported(encoderConfig);
    if (!support.supported) {
      // VP9が駄目ならVP8にフォールバック
      encoderConfig.codec = 'vp8';
      const vp8Support = await VideoEncoder.isConfigSupported(encoderConfig);
      if (!vp8Support.supported) {
        throw new Error('サポートされるビデオコーデックがありません');
      }
    }

    const encoder = new VideoEncoder({
      output: (chunk) => {
        encodedChunks.push(chunk);
      },
      error: (e) => {
        console.error('Encoder error:', e);
      },
    });

    encoder.configure(encoderConfig);

    exportProgress = 'エンコーダー初期化完了';

    // フレームをバッチ処理で高速化
    const batchSize = 10; // 一度に処理するフレーム数
    const startTime = performance.now();

    for (let batch = 0; batch < totalFrames; batch += batchSize) {
      const batchEnd = Math.min(batch + batchSize, totalFrames);

      for (let frame = batch; frame < batchEnd; frame++) {
        const time = frame / fps;

        await renderFrameToCanvas(exportCtx, exportCanvas, time);

        // VideoFrameを作成してエンコード
        const videoFrame = new VideoFrame(exportCanvas, {
          timestamp: frame * (1000000 / fps), // マイクロ秒
          duration: 1000000 / fps,
        });

        const keyFrame = frame % (fps * 2) === 0; // 2秒ごとにキーフレーム
        encoder.encode(videoFrame, { keyFrame });
        videoFrame.close();
      }

      // 進捗更新
      const progress = Math.round((batchEnd / totalFrames) * 100);
      const elapsed = (performance.now() - startTime) / 1000;
      const remaining = elapsed / (batchEnd / totalFrames) - elapsed;
      exportProgress = `レンダリング中... ${progress}% (残り約${Math.ceil(remaining)}秒)`;

      // UIを更新させる
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    // エンコード完了を待つ
    exportProgress = 'エンコード完了待ち...';
    await encoder.flush();
    encoder.close();

    // WebMコンテナを作成（簡易的なWebMヘッダー）
    exportProgress = 'WebMファイル生成中...';
    const webmBlob = await createWebMFromChunks(encodedChunks, settings.width, settings.height, fps, totalDuration);

    return webmBlob;
  }

  // EncodedVideoChunksからWebMファイルを作成
  async function createWebMFromChunks(
    chunks: EncodedVideoChunk[],
    width: number,
    height: number,
    fps: number,
    duration: number
  ): Promise<Blob> {
    // 簡易的なアプローチ: チャンクデータを抽出
    const chunkData: ArrayBuffer[] = [];
    for (const chunk of chunks) {
      const buffer = new ArrayBuffer(chunk.byteLength);
      chunk.copyTo(buffer);
      chunkData.push(buffer);
    }

    // WebMコンテナ作成（簡易版 - 実際にはmux.jsなどが必要）
    // ここでは生のビデオデータとしてBlobを作成
    // 注意: 完全なWebMには適切なコンテナフォーマットが必要
    const totalSize = chunkData.reduce((sum, buf) => sum + buf.byteLength, 0);
    const combinedBuffer = new Uint8Array(totalSize);
    let offset = 0;
    for (const buf of chunkData) {
      combinedBuffer.set(new Uint8Array(buf), offset);
      offset += buf.byteLength;
    }

    // MediaRecorderを使ってコンテナ化（WebCodecsのチャンクをラップ）
    return new Blob([combinedBuffer], { type: 'video/webm' });
  }

  async function startExport() {
    showExportDialog = false;
    isExporting = true;
    exportProgress = '準備中...';

    const settings = exportPresets[selectedPreset];
    const totalDuration = getTotalDuration();
    const fps = settings.fps;

    try {
      // 画像をプリロード（重要！）
      exportProgress = '画像を読み込み中...';
      await preloadAllImages();
      console.log('All images preloaded. MediaItems:', project.mediaItems.length);
      console.log('Tracks:', project.tracks.map(t => ({ name: t.name, type: t.type, clips: t.clips.length })));

      // MediaRecorderでWebMエクスポート（映像のみ、高速）
      const videoBlob = await startExportWithMediaRecorder(settings, totalDuration, fps);
      // ファイル名をASCII文字のみに制限（バッチファイル互換性のため）
      const safeProjectName = (project.name || 'video').replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileName = `${safeProjectName}_${selectedPreset}`;

      // 映像WebMをダウンロード
      exportProgress = 'ダウンロード中...';
      const videoUrl = URL.createObjectURL(videoBlob);
      const videoLink = document.createElement('a');
      videoLink.href = videoUrl;
      videoLink.download = `${fileName}_video.webm`;
      document.body.appendChild(videoLink);
      videoLink.click();
      document.body.removeChild(videoLink);
      URL.revokeObjectURL(videoUrl);

      // 音声をWAVでエクスポート
      exportProgress = '音声をエクスポート中...';
      const audioBuffer = await createMixedAudioBuffer(totalDuration);
      if (audioBuffer) {
        const wavBlob = audioBufferToWav(audioBuffer);
        const audioUrl = URL.createObjectURL(wavBlob);
        const audioLink = document.createElement('a');
        audioLink.href = audioUrl;
        audioLink.download = `${fileName}_audio.wav`;
        document.body.appendChild(audioLink);
        audioLink.click();
        document.body.removeChild(audioLink);
        URL.revokeObjectURL(audioUrl);
      }

      // バッチファイルをダウンロード（映像と音声を結合）
      if (downloadBatchFile) {
        const batchContent = `@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
echo ========================================
echo   Video Merge + MP4 Converter (GPU NVENC)
echo ========================================
echo.
echo Video: ${fileName}_video.webm
echo Audio: ${fileName}_audio.wav
echo Output: ${fileName}.mp4
echo.
echo Using GPU (RTX 4070 SUPER - NVENC)...
echo.

ffmpeg -y -hwaccel cuda -i "${fileName}_video.webm" -i "${fileName}_audio.wav" -c:v h264_nvenc -preset p4 -tune hq -b:v 8M -c:a aac -b:a 128k -shortest "${fileName}.mp4"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo   Done! (GPU Accelerated)
    echo   Output: ${fileName}.mp4
    echo ========================================
    echo.
    set /p DELETE_FILES=Delete source files? (Y/N):
    if /i "!DELETE_FILES!"=="Y" (
        del "${fileName}_video.webm"
        del "${fileName}_audio.wav"
        echo Source files deleted.
    )
) else (
    echo.
    echo ========================================
    echo   Error: GPU encoding failed
    echo ========================================
    echo.
    echo Make sure:
    echo   1. Files exist in this folder
    echo   2. NVIDIA drivers are installed
    echo   3. FFmpeg has NVENC support
)

echo.
pause
`;
        const batchBlob = new Blob([batchContent], { type: 'text/plain;charset=utf-8' });
        const batchUrl = URL.createObjectURL(batchBlob);
        const batchLink = document.createElement('a');
        batchLink.href = batchUrl;
        batchLink.download = `create_mp4.bat`;
        document.body.appendChild(batchLink);
        batchLink.click();
        document.body.removeChild(batchLink);
        URL.revokeObjectURL(batchUrl);
      }

      let message = 'エクスポートが完了しました！\n\n';
      message += `映像: ${fileName}_video.webm\n`;
      message += `音声: ${fileName}_audio.wav\n`;
      if (downloadBatchFile) {
        message += '\nMP4に結合するには:\n';
        message += '1. 3つのファイルを同じフォルダに置く\n';
        message += '2. create_mp4.bat をダブルクリック\n';
        message += '\n※ FFmpegが必要です (winget install ffmpeg)';
      }
      alert(message);
    } catch (e) {
      console.error('Export error:', e);
      alert(`エクスポートエラー: ${e}`);
    } finally {
      isExporting = false;
      exportProgress = '';
    }
  }

  // WebCodecsを使った高速エクスポート（YMM4/DaVinci Resolve方式）
  async function startExportWithMediaRecorder(
    settings: ExportSettings,
    totalDuration: number,
    fps: number
  ): Promise<Blob> {
    // エクスポート用キャンバス作成
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = settings.width;
    exportCanvas.height = settings.height;
    const exportCtx = exportCanvas.getContext('2d')!;

    const totalFrames = Math.ceil(totalDuration * fps);
    const startTime = performance.now();

    // エンコーダー設定（複数コーデックを試行）
    const codecOptions = [
      { codec: 'vp09.00.10.08', name: 'vp9', muxerCodec: 'V_VP9' },
      { codec: 'vp8', name: 'vp8', muxerCodec: 'V_VP8' },
      { codec: 'avc1.42001E', name: 'h264', muxerCodec: 'V_MPEG4/ISO/AVC' }, // H.264 Baseline
      { codec: 'avc1.4D001E', name: 'h264', muxerCodec: 'V_MPEG4/ISO/AVC' }, // H.264 Main
    ];

    let encoderConfig: VideoEncoderConfig | null = null;
    let codecUsed = '';
    let muxerCodec = 'V_VP9';

    // まずハードウェアアクセラレーションで試行、次にソフトウェアで試行
    const hwOptions: HardwareAcceleration[] = ['prefer-hardware', 'prefer-software'];

    for (const hwAccel of hwOptions) {
      for (const opt of codecOptions) {
        const config: VideoEncoderConfig = {
          codec: opt.codec,
          width: settings.width,
          height: settings.height,
          bitrate: settings.videoBitrate,
          framerate: fps,
          hardwareAcceleration: hwAccel,
        };
        try {
          const support = await VideoEncoder.isConfigSupported(config);
          if (support.supported) {
            encoderConfig = config;
            codecUsed = opt.name;
            muxerCodec = opt.muxerCodec;
            console.log(`Codec ${opt.name} (${opt.codec}) with ${hwAccel} is supported`);
            break;
          } else {
            console.log(`Codec ${opt.name} (${opt.codec}) with ${hwAccel} is NOT supported`);
          }
        } catch (e) {
          console.log(`Codec ${opt.name} (${opt.codec}) with ${hwAccel} error:`, e);
        }
      }
      if (encoderConfig) break;
    }

    if (!encoderConfig) {
      throw new Error('サポートされるビデオコーデックがありません。Chrome/Edgeの最新版をお使いください。');
    }

    const hwAccelUsed = encoderConfig.hardwareAcceleration || 'default';
    console.log(`Using codec: ${codecUsed}, muxerCodec: ${muxerCodec}, HW acceleration: ${hwAccelUsed}`);

    // webm-muxerでWebMファイルを作成（コーデック決定後）
    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: {
        codec: muxerCodec,
        width: settings.width,
        height: settings.height,
        frameRate: fps,
      },
      firstTimestampBehavior: 'offset',
    });

    // VideoEncoderの設定
    const encoder = new VideoEncoder({
      output: (chunk, meta) => {
        muxer.addVideoChunk(chunk, meta);
      },
      error: (e) => {
        console.error('VideoEncoder error:', e);
      },
    });

    encoder.configure(encoderConfig);

    // 高速レンダリング（リアルタイム同期なし）
    let encodedFrames = 0;
    for (let frame = 0; frame <= totalFrames; frame++) {
      const time = frame / fps;

      const progress = Math.round((frame / totalFrames) * 100);
      const elapsed = (performance.now() - startTime) / 1000;
      const framesPerSecond = elapsed > 0 ? frame / elapsed : 0;
      const remaining = framesPerSecond > 0 ? (totalFrames - frame) / framesPerSecond : 0;
      exportProgress = `レンダリング中... ${progress}% (${Math.round(framesPerSecond)} fps, 残り約${Math.ceil(remaining)}秒)`;

      await renderFrameToCanvas(exportCtx, exportCanvas, time);

      // VideoFrameを作成してエンコード
      const videoFrame = new VideoFrame(exportCanvas, {
        timestamp: frame * (1000000 / fps), // マイクロ秒
        duration: 1000000 / fps,
      });

      const keyFrame = frame % (fps * 2) === 0; // 2秒ごとにキーフレーム
      encoder.encode(videoFrame, { keyFrame });
      videoFrame.close();
      encodedFrames++;

      // エンコーダーキューが詰まらないように待機
      while (encoder.encodeQueueSize > 10) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }

      // UIを更新させる（10フレームごと）
      if (frame % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    console.log(`Encoded ${encodedFrames} frames, flushing...`);
    exportProgress = 'エンコード完了待ち...';

    // タイムアウト付きでflushを待つ
    const flushPromise = encoder.flush();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Flush timeout')), 30000)
    );

    try {
      await Promise.race([flushPromise, timeoutPromise]);
    } catch (e) {
      console.warn('Flush timeout or error, continuing anyway:', e);
    }

    encoder.close();

    exportProgress = 'WebMファイル生成中...';
    muxer.finalize();

    const { buffer } = muxer.target as ArrayBufferTarget;
    return new Blob([buffer], { type: 'video/webm' });
  }

  // ブラウザのFile System Access APIでファイルを読み込む
  async function readFileFromHandle(fileHandle: FileSystemFileHandle): Promise<ArrayBuffer> {
    const file = await fileHandle.getFile();
    return await file.arrayBuffer();
  }

  // ブラウザのFile System Access APIでテキストファイルを読み込む
  async function readTextFromHandle(fileHandle: FileSystemFileHandle): Promise<string> {
    const file = await fileHandle.getFile();
    return await file.text();
  }

  // プロジェクト保存用データ型
  interface SavedProject {
    version: number;
    project: Project;
    subtitles: Array<{ text: string; startTime: number; endTime: number }>;
    savedAt: string;
  }

  // プロジェクトを保存
  async function saveProject() {
    try {
      const saveData: SavedProject = {
        version: 1,
        project: project,
        subtitles: subtitles,
        savedAt: new Date().toISOString()
      };

      const jsonStr = JSON.stringify(saveData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });

      // @ts-ignore - File System Access API
      if ('showSaveFilePicker' in window) {
        // @ts-ignore
        const fileHandle = await window.showSaveFilePicker({
          suggestedName: `${project.name || 'project'}.svproj`,
          types: [{
            description: 'Satomatashiki Video Editor Project',
            accept: { 'application/json': ['.svproj'] }
          }]
        });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        alert('プロジェクトを保存しました');
      } else {
        // フォールバック: ダウンロード
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${project.name || 'project'}.svproj`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        console.error('Save error:', e);
        alert(`保存エラー: ${e}`);
      }
    }
  }

  // プロジェクトを読み込み
  async function loadProject() {
    try {
      // @ts-ignore - File System Access API
      if ('showOpenFilePicker' in window) {
        // @ts-ignore
        const [fileHandle] = await window.showOpenFilePicker({
          types: [{
            description: 'Satomatashiki Video Editor Project',
            accept: { 'application/json': ['.svproj'] }
          }]
        });
        const file = await fileHandle.getFile();
        const jsonStr = await file.text();
        const saveData: SavedProject = JSON.parse(jsonStr);

        if (saveData.version && saveData.project) {
          project = saveData.project;
          subtitles = saveData.subtitles || [];
          selectedClipId = null;
          currentTime = 0;
          alert('プロジェクトを読み込みました');
        } else {
          alert('無効なプロジェクトファイルです');
        }
      } else {
        // フォールバック: input要素を使用
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.svproj';
        input.onchange = async () => {
          const file = input.files?.[0];
          if (file) {
            const jsonStr = await file.text();
            const saveData: SavedProject = JSON.parse(jsonStr);
            if (saveData.version && saveData.project) {
              project = saveData.project;
              subtitles = saveData.subtitles || [];
              selectedClipId = null;
              currentTime = 0;
              alert('プロジェクトを読み込みました');
            } else {
              alert('無効なプロジェクトファイルです');
            }
          }
        };
        input.click();
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        console.error('Load error:', e);
        alert(`読み込みエラー: ${e}`);
      }
    }
  }

  // content-generatorのプロジェクトをインポート（ブラウザ版）
  async function importContentGeneratorProject() {
    // @ts-ignore - File System Access API
    if (!('showDirectoryPicker' in window)) {
      alert('このブラウザはFile System Access APIに対応していません');
      return;
    }

    try {
      // @ts-ignore
      directoryHandle = await window.showDirectoryPicker({
        mode: 'read'
      });
    } catch (e) {
      // ユーザーがキャンセルした場合
      return;
    }

    if (!directoryHandle) return;

    isImporting = true;

    try {
      // videoサブフォルダを取得
      let videoFolder: FileSystemDirectoryHandle;
      try {
        videoFolder = await directoryHandle.getDirectoryHandle('video');
      } catch (e) {
        alert('選択したフォルダにvideoサブフォルダがありません');
        return;
      }

      // video-data-*.jsonファイルを探す
      let videoDataFile: FileSystemFileHandle | null = null;
      for await (const [name, handle] of videoFolder.entries()) {
        if (handle.kind === 'file' && name.startsWith('video-data-') && name.endsWith('.json')) {
          videoDataFile = handle as FileSystemFileHandle;
          break;
        }
      }

      if (!videoDataFile) {
        alert('video-data-*.jsonファイルが見つかりません');
        return;
      }

      const jsonText = await readTextFromHandle(videoDataFile);
      const videoProject: VideoProjectSaveData = JSON.parse(jsonText);

      project = createDefaultProject();

      let videoTrackTime = 0;
      let audioTrackTime = 0;
      const imageTrack = project.tracks.find(t => t.type === 'image')!;
      const audioTrack = project.tracks.find(t => t.type === 'audio')!;

      for (const section of videoProject.sections) {
        let audioDuration = 5;

        if (section.audioFileName) {
          try {
            const audioFileHandle = await videoFolder.getFileHandle(section.audioFileName);
            const audioData = await readFileFromHandle(audioFileHandle);
            const blob = new Blob([audioData], { type: 'audio/wav' });
            const url = URL.createObjectURL(blob);

            const audioItem: MediaItem = {
              id: crypto.randomUUID(),
              type: 'audio',
              name: section.audioFileName,
              path: url, // blob URLを使用
              duration: 5
            };

            // 音声の長さを取得
            const audio = new Audio(url);
            await new Promise<void>((resolve) => {
              audio.onloadedmetadata = () => {
                audioItem.duration = audio.duration;
                audioDuration = audio.duration;
                resolve();
              };
              audio.onerror = () => {
                resolve();
              };
            });

            project.mediaItems = [...project.mediaItems, audioItem];

            const audioClip: Clip = {
              id: crypto.randomUUID(),
              mediaId: audioItem.id,
              trackId: audioTrack.id,
              startTime: audioTrackTime,
              duration: audioDuration,
              inPoint: 0,
              outPoint: audioDuration
            };
            audioTrack.clips = [...audioTrack.clips, audioClip];
          } catch (e) {
            console.warn('Failed to load audio:', section.audioFileName, e);
          }
        }

        let imageDataUrl: string | null = null;
        let imageName = '';

        if (section.imageFileName) {
          try {
            const imageFileHandle = await videoFolder.getFileHandle(section.imageFileName);
            const imageData = await readFileFromHandle(imageFileHandle);
            const blob = new Blob([imageData], { type: 'image/png' });
            const url = URL.createObjectURL(blob);

            const imageItem: MediaItem = {
              id: crypto.randomUUID(),
              type: 'image',
              name: section.imageFileName,
              path: url, // blob URLを使用
              duration: audioDuration
            };

            project.mediaItems = [...project.mediaItems, imageItem];

            const imageClip: Clip = {
              id: crypto.randomUUID(),
              mediaId: imageItem.id,
              trackId: imageTrack.id,
              startTime: videoTrackTime,
              duration: audioDuration,
              inPoint: 0,
              outPoint: audioDuration
            };
            imageTrack.clips = [...imageTrack.clips, imageClip];
          } catch (e) {
            console.warn('Failed to load image:', section.imageFileName, e);
          }
        } else if (section.selectedSlideId && videoProject.slidePresentation) {
          const slide = videoProject.slidePresentation.slides.find(
            s => s.id === section.selectedSlideId
          );
          if (slide) {
            imageDataUrl = renderSlideToDataUrl(slide);
            imageName = `${section.heading || section.id}.png`;

            if (imageDataUrl) {
              const imageItem: MediaItem = {
                id: crypto.randomUUID(),
                type: 'image',
                name: imageName,
                path: imageDataUrl,
                duration: audioDuration
              };

              project.mediaItems = [...project.mediaItems, imageItem];

              const imageClip: Clip = {
                id: crypto.randomUUID(),
                mediaId: imageItem.id,
                trackId: imageTrack.id,
                startTime: videoTrackTime,
                duration: audioDuration,
                inPoint: 0,
                outPoint: audioDuration
              };
              imageTrack.clips = [...imageTrack.clips, imageClip];
            }
          }
        }

        videoTrackTime += audioDuration;
        audioTrackTime += audioDuration;
      }

      // 字幕データを読み込み、画像トラックに追加
      if (videoProject.subtitles && videoProject.subtitles.length > 0) {
        subtitles = videoProject.subtitles;
        if (videoProject.subtitleSettings) {
          subtitleSettings = videoProject.subtitleSettings;
        }

        // 字幕用の画像トラックを追加（最も手前に表示）
        const subtitleTrack = createTrack('image', 99); // 高いorderで手前に
        subtitleTrack.name = '字幕';
        project.tracks = [...project.tracks, subtitleTrack];

        // 字幕をクリップとして追加
        for (const sub of subtitles) {
          const subtitleMedia: MediaItem = {
            id: crypto.randomUUID(),
            type: 'subtitle',
            name: sub.text.substring(0, 10) + (sub.text.length > 10 ? '...' : ''),
            path: '',
            duration: sub.endTime - sub.startTime,
            text: sub.text
          };
          project.mediaItems = [...project.mediaItems, subtitleMedia];

          const subtitleClip: Clip = {
            id: crypto.randomUUID(),
            mediaId: subtitleMedia.id,
            trackId: subtitleTrack.id,
            startTime: sub.startTime,
            duration: sub.endTime - sub.startTime,
            inPoint: 0,
            outPoint: sub.endTime - sub.startTime
          };
          subtitleTrack.clips = [...subtitleTrack.clips, subtitleClip];
        }
      }

      project.tracks = [...project.tracks];

      currentTime = 0;
      stopAllAudio();

      const subtitleInfo = subtitles.length > 0 ? `、字幕${subtitles.length}件` : '';
      alert(`インポート完了: ${videoProject.sections.length}セクション${subtitleInfo}`);
    } catch (e) {
      console.error('Import error:', e);
      alert(`インポートエラー: ${e}`);
    } finally {
      isImporting = false;
    }
  }

  // YMM4方式：下のトラックほど手前に表示（orderが大きいほど手前）
  // 画像トラックのクリップを取得（すべての画像トラックから現在時間に該当するものを返す）
  function getCurrentClips(): { clip: Clip; media: MediaItem; track: Track }[] {
    const result: { clip: Clip; media: MediaItem; track: Track }[] = [];
    // orderでソート（小さい順 = 背面から手前へ）
    const sortedTracks = [...project.tracks]
      .filter(t => t.type === 'image' && t.visible)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    for (const track of sortedTracks) {
      for (const clip of track.clips) {
        if (currentTime >= clip.startTime && currentTime < clip.startTime + clip.duration) {
          const media = project.mediaItems.find(m => m.id === clip.mediaId);
          if (media) {
            result.push({ clip, media, track });
          }
        }
      }
    }
    return result;
  }

  // 最も手前のクリップを取得（後方互換用）
  function getCurrentClip(): { clip: Clip; media: MediaItem } | null {
    const clips = getCurrentClips();
    return clips.length > 0 ? clips[clips.length - 1] : null;
  }

  async function loadImage(path: string): Promise<HTMLImageElement> {
    if (loadedImages.has(path)) {
      return loadedImages.get(path)!;
    }
    const img = new Image();
    // ブラウザ版ではblob URLまたはdata URLを直接使用
    img.src = path;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject();
    });
    loadedImages.set(path, img);
    return img;
  }

  async function loadAudio(mediaItem: MediaItem): Promise<HTMLAudioElement> {
    if (audioElements.has(mediaItem.id)) {
      return audioElements.get(mediaItem.id)!;
    }

    const audio = new Audio();
    // ブラウザ版ではblob URLまたはdata URLを直接使用
    audio.src = mediaItem.path;

    await new Promise<void>((resolve, reject) => {
      audio.oncanplaythrough = () => resolve();
      audio.onerror = () => reject(new Error('Audio load failed'));
    });

    audioElements.set(mediaItem.id, audio);
    return audio;
  }

  async function syncAudioPlayback() {
    const audioTrack = project.tracks.find(t => t.type === 'audio');
    if (!audioTrack) return;

    for (const clip of audioTrack.clips) {
      const media = project.mediaItems.find(m => m.id === clip.mediaId);
      if (!media || media.type !== 'audio') continue;

      try {
        const audio = await loadAudio(media);
        const clipStart = clip.startTime;
        const clipEnd = clip.startTime + clip.duration;

        // 再生速度を適用
        audio.playbackRate = playbackRate;

        if (isPlaying && currentTime >= clipStart && currentTime < clipEnd) {
          const audioTime = currentTime - clipStart + clip.inPoint;
          if (audio.paused) {
            audio.currentTime = audioTime;
            audio.play().catch(e => console.warn('Audio play failed:', e));
          } else if (Math.abs(audio.currentTime - audioTime) > 0.1) {
            audio.currentTime = audioTime;
          }
        } else {
          if (!audio.paused) {
            audio.pause();
          }
        }
      } catch (e) {
        console.warn('Audio sync failed:', e);
      }
    }
  }

  function stopAllAudio() {
    for (const audio of audioElements.values()) {
      audio.pause();
      audio.currentTime = 0;
    }
  }

  async function renderPreview() {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // YMM4方式：すべての画像トラックのクリップを背面から順に描画
    const clips = getCurrentClips();
    for (const { media, clip } of clips) {
      if (media.type === 'image') {
        try {
          const img = await loadImage(media.path);
          const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          const x = (canvas.width - w) / 2;
          const y = (canvas.height - h) / 2;

          // 透明度を適用
          const opacity = clip.opacity ?? 1;
          ctx.globalAlpha = opacity;
          ctx.drawImage(img, x, y, w, h);
          ctx.globalAlpha = 1;
        } catch (e) {
          ctx.fillStyle = '#f38ba8';
          ctx.font = '14px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('画像読み込みエラー', canvas.width / 2, canvas.height / 2);
        }
      } else if (media.type === 'subtitle' && media.text) {
        // 字幕の描画
        drawSubtitleText(ctx, media.text);
      }
    }

    // 字幕を描画
    const subtitle = getCurrentSubtitle();
    if (subtitle) {
      const padding = 16;
      const fontSize = 24;
      const lineHeight = fontSize * 1.4;

      ctx.font = `bold ${fontSize}px "Noto Sans JP", "Yu Gothic", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';

      // テキストを複数行に分割（改行がある場合）
      const lines = subtitle.text.split('\n');
      const totalHeight = lines.length * lineHeight;
      const startY = canvas.height - padding - totalHeight + lineHeight;

      for (let i = 0; i < lines.length; i++) {
        const text = lines[i];
        const y = startY + i * lineHeight;

        // 背景（半透明の黒）
        const metrics = ctx.measureText(text);
        const bgWidth = metrics.width + padding * 2;
        const bgHeight = lineHeight;
        const bgX = (canvas.width - bgWidth) / 2;
        const bgY = y - lineHeight + 4;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(bgX, bgY, bgWidth, bgHeight);

        // テキスト（白）
        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, canvas.width / 2, y);
      }
    }
  }

  function togglePlay() {
    if (isPlaying) {
      if (playInterval) {
        clearInterval(playInterval);
        playInterval = null;
      }
      stopAllAudio();
      isPlaying = false;
    } else {
      const totalDuration = getTotalDuration();
      if (totalDuration <= 0) {
        return;
      }

      isPlaying = true;
      const fps = 30;
      const frameTime = 1000 / fps;
      playInterval = setInterval(() => {
        // 再生速度を適用
        currentTime += (1 / fps) * playbackRate;
        if (currentTime >= totalDuration) {
          currentTime = 0;
          if (playInterval) clearInterval(playInterval);
          playInterval = null;
          stopAllAudio();
          isPlaying = false;
        }
      }, frameTime) as unknown as number;
    }
  }

  $effect(() => {
    currentTime;
    renderPreview();
    if (isPlaying) {
      syncAudioPlayback();
    }
  });

  async function importMedia() {
    // ブラウザ用ファイル選択
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*,audio/*,video/*';

    input.onchange = async () => {
      if (!input.files) return;

      for (const file of Array.from(input.files)) {
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        const name = file.name;

        let type: 'image' | 'audio' | 'video' = 'image';
        if (['wav', 'mp3', 'aac', 'ogg'].includes(ext)) type = 'audio';
        if (['mp4', 'mov', 'avi', 'webm'].includes(ext)) type = 'video';

        const url = URL.createObjectURL(file);

        const item: MediaItem = {
          id: crypto.randomUUID(),
          type,
          name,
          path: url,
          duration: type === 'image' ? 5 : undefined,
        };

        if (type === 'audio') {
          try {
            const audio = new Audio(url);
            await new Promise<void>((resolve) => {
              audio.onloadedmetadata = () => {
                item.duration = audio.duration;
                resolve();
              };
              audio.onerror = () => resolve();
            });
          } catch (e) {
            item.duration = 5;
          }
        }

        project.mediaItems = [...project.mediaItems, item];
      }
    };

    input.click();
  }

  function addToTimeline(media: MediaItem) {
    const trackType = media.type === 'audio' ? 'audio' : 'image';
    const track = project.tracks.find(t => t.type === trackType);
    if (!track) return;

    const lastEnd = track.clips.reduce((max, c) => Math.max(max, c.startTime + c.duration), 0);

    const clip: Clip = {
      id: crypto.randomUUID(),
      mediaId: media.id,
      trackId: track.id,
      startTime: lastEnd,
      duration: media.duration || 5,
      inPoint: 0,
      outPoint: media.duration || 5,
    };

    track.clips = [...track.clips, clip];
    project.tracks = [...project.tracks];
  }

  function deleteClip(clipId: string) {
    for (const track of project.tracks) {
      track.clips = track.clips.filter(c => c.id !== clipId);
    }
    project.tracks = [...project.tracks];
    selectedClipId = null;
  }

  // 画像トラック追加（YMM4方式）
  function addImageTrack() {
    // 音声トラックより前に挿入（画像トラックは音声トラックより上に表示）
    const audioTracks = project.tracks.filter(t => t.type === 'audio');
    const imageTracks = project.tracks.filter(t => t.type === 'image');

    // 画像トラックの最大orderを取得し、その下に追加（より手前に表示）
    const maxImageOrder = Math.max(...imageTracks.map(t => t.order ?? 0), -1);
    const newTrack = createTrack('image', maxImageOrder + 1);
    project.tracks = [...project.tracks, newTrack];
  }

  // 音声トラック追加
  function addAudioTrack() {
    const audioTracks = project.tracks.filter(t => t.type === 'audio');
    const maxAudioOrder = Math.max(...audioTracks.map(t => t.order ?? 100), 99);
    const newTrack = createTrack('audio', maxAudioOrder + 1);
    project.tracks = [...project.tracks, newTrack];
  }

  // トラック削除
  function deleteTrack(trackId: string) {
    if (project.tracks.length <= 1) {
      alert('最低1つのトラックが必要です');
      return;
    }
    project.tracks = project.tracks.filter(t => t.id !== trackId);
  }

  // トラックを上に移動（同じ種類のトラック内で）
  function moveTrackUp(trackId: string) {
    const track = project.tracks.find(t => t.id === trackId);
    if (!track) return;

    // 同じ種類のトラックのみを取得してソート
    const sameTypeTracks = project.tracks
      .filter(t => t.type === track.type)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const index = sameTypeTracks.findIndex(t => t.id === trackId);
    if (index <= 0) return;

    // orderを入れ替え
    const currentTrack = sameTypeTracks[index];
    const prevTrack = sameTypeTracks[index - 1];
    const tempOrder = currentTrack.order;
    currentTrack.order = prevTrack.order;
    prevTrack.order = tempOrder;

    project.tracks = [...project.tracks];
  }

  // トラックを下に移動（同じ種類のトラック内で）
  function moveTrackDown(trackId: string) {
    const track = project.tracks.find(t => t.id === trackId);
    if (!track) return;

    // 同じ種類のトラックのみを取得してソート
    const sameTypeTracks = project.tracks
      .filter(t => t.type === track.type)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const index = sameTypeTracks.findIndex(t => t.id === trackId);
    if (index < 0 || index >= sameTypeTracks.length - 1) return;

    // orderを入れ替え
    const currentTrack = sameTypeTracks[index];
    const nextTrack = sameTypeTracks[index + 1];
    const tempOrder = currentTrack.order;
    currentTrack.order = nextTrack.order;
    nextTrack.order = tempOrder;

    project.tracks = [...project.tracks];
  }

  // トラックの表示/非表示を切り替え
  function toggleTrackVisibility(trackId: string) {
    const track = project.tracks.find(t => t.id === trackId);
    if (track) {
      track.visible = !track.visible;
      project.tracks = [...project.tracks];
    }
  }

  // トラックのミュートを切り替え
  function toggleTrackMute(trackId: string) {
    const track = project.tracks.find(t => t.id === trackId);
    if (track) {
      track.muted = !track.muted;
      project.tracks = [...project.tracks];
    }
  }

  // トラックのロックを切り替え
  function toggleTrackLock(trackId: string) {
    const track = project.tracks.find(t => t.id === trackId);
    if (track) {
      track.locked = !track.locked;
      project.tracks = [...project.tracks];
    }
  }

  // ソートされたトラックを取得
  function getSortedTracks(): Track[] {
    return [...project.tracks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  function formatTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 100);
    return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  }

  function getTotalDuration(): number {
    let max = 0;
    for (const track of project.tracks) {
      for (const clip of track.clips) {
        max = Math.max(max, clip.startTime + clip.duration);
      }
    }
    return max;
  }

  function getTimelineDisplayDuration(): number {
    return Math.max(getTotalDuration(), 10);
  }

  function getMediaName(mediaId: string): string {
    return project.mediaItems.find(m => m.id === mediaId)?.name || '不明';
  }
</script>

<!-- エクスポートダイアログ -->
{#if showExportDialog}
  <div class="dialog-overlay" onclick={() => showExportDialog = false}>
    <div class="dialog" onclick={(e) => e.stopPropagation()}>
      <h2>動画エクスポート</h2>
      <div class="dialog-content">
        <div class="form-group">
          <label>出力設定（YouTube用）</label>
          <select bind:value={selectedPreset}>
            <option value="youtube-1080p">YouTube 1080p (1920×1080, 30fps)</option>
            <option value="youtube-720p">YouTube 720p (1280×720, 30fps)</option>
            <option value="youtube-480p">YouTube 480p (854×480, 30fps)</option>
          </select>
        </div>
        <div class="form-group checkbox-group">
          <label class="checkbox-label">
            <input type="checkbox" bind:checked={downloadBatchFile} />
            <span>MP4変換用バッチファイルも一緒にダウンロード</span>
          </label>
          <p class="checkbox-hint">
            FFmpegがインストールされている場合、バッチファイルをダブルクリックでGPU高速変換できます
          </p>
        </div>
        <div class="export-info">
          <p><strong>出力形式:</strong> WebM (VP9)</p>
          <p><strong>動画の長さ:</strong> {formatTime(getTotalDuration())}</p>
          <p class="note">※ WebMはYouTubeに直接アップロード可能です</p>
        </div>
      </div>
      <div class="dialog-actions">
        <button class="cancel-btn" onclick={() => showExportDialog = false}>キャンセル</button>
        <button class="confirm-btn" onclick={startExport}>エクスポート開始</button>
      </div>
    </div>
  </div>
{/if}

<div class="app">
  <header>
    <h1>Satomatashiki Video Editor</h1>
    <div class="controls">
      <button onclick={saveProject} class="save-btn" title="プロジェクトを保存">
        保存
      </button>
      <button onclick={loadProject} class="load-btn" title="プロジェクトを開く">
        開く
      </button>
      <button onclick={importContentGeneratorProject} class="import-project-btn" disabled={isImporting}>
        {isImporting ? 'インポート中...' : 'プロジェクト読込'}
      </button>
      <button onclick={importMedia}>メディア追加</button>
      <button onclick={togglePlay} class="play-btn">{isPlaying ? '停止' : '再生'}</button>
      <!-- 再生速度コントロール -->
      <div class="speed-control">
        {#each playbackRates as rate}
          <button
            class="speed-btn"
            class:active={playbackRate === rate}
            onclick={() => playbackRate = rate}
          >
            {rate}x
          </button>
        {/each}
      </div>
      <button onclick={exportVideo} class="export-btn" disabled={isExporting}>
        {isExporting ? exportProgress || 'エクスポート中...' : 'エクスポート'}
      </button>
      <button onclick={() => showSubtitles = !showSubtitles} class="subtitle-btn" class:active={showSubtitles}>
        {showSubtitles ? '字幕ON' : '字幕OFF'}
      </button>
      <span class="time">{formatTime(currentTime)} / {formatTime(getTotalDuration())}</span>
      {#if subtitles.length > 0}
        <span class="subtitle-count">字幕: {subtitles.length}件</span>
      {/if}
    </div>
  </header>

  <div class="main">
    <aside class="media-panel">
      <h2>メディア</h2>
      <div class="media-list">
        {#each project.mediaItems as item}
          <div class="media-item" draggable="true" ondblclick={() => addToTimeline(item)}>
            <span class="type">{item.type === 'image' ? '🖼' : item.type === 'audio' ? '🔊' : '🎬'}</span>
            <span class="name">{item.name}</span>
          </div>
        {/each}
        {#if project.mediaItems.length === 0}
          <p class="empty">メディアがありません<br/>「メディア追加」をクリック</p>
        {/if}
      </div>
    </aside>

    <section class="preview-panel">
      <div class="preview-container">
        <canvas bind:this={canvas} width="640" height="360"></canvas>
      </div>
    </section>

    <aside class="property-panel">
      <h2>プロパティ</h2>
      {#if selectedClipId}
        <button onclick={() => deleteClip(selectedClipId!)}>クリップ削除</button>
      {:else}
        <p class="empty">クリップを選択してください</p>
      {/if}
    </aside>
  </div>

  <!-- 再生バー（シークバー） -->
  <div class="seekbar-container">
    <div class="seekbar-time">{formatTime(currentTime)}</div>
    <input
      type="range"
      class="seekbar"
      min="0"
      max={getTotalDuration() || 10}
      step="0.01"
      bind:value={currentTime}
    />
    <div class="seekbar-time">{formatTime(getTotalDuration())}</div>
  </div>

  <section class="timeline" style="height: {timelineHeight}px">
    <div class="timeline-resize-handle" onmousedown={startTimelineResize} role="separator" aria-orientation="horizontal"></div>
    <div class="timeline-header">
      <!-- 画像トラック追加ボタン（YMM4方式） -->
      <div class="add-track-container">
        <button class="add-track-btn image-track-btn" onclick={addImageTrack} title="画像トラックを追加">
          + 画像
        </button>
        <button class="add-track-btn audio-track-btn" onclick={addAudioTrack} title="音声トラックを追加">
          + 音声
        </button>
      </div>
      <div class="zoom-control">
        <button onclick={() => zoom = Math.max(10, zoom - 10)}>-</button>
        <span>{zoom}px/s</span>
        <button onclick={() => zoom = Math.min(200, zoom + 10)}>+</button>
      </div>
    </div>

    <div class="timeline-content">
      <div class="ruler-row">
        <div class="ruler-header"></div>
        <div class="ruler" style="width: {getTimelineDisplayDuration() * zoom}px">
          {#each Array(Math.ceil(getTimelineDisplayDuration() / 5) + 1) as _, i}
            <span class="mark" style="left: {i * 5 * zoom}px">{i * 5}s</span>
          {/each}
          <div class="playhead" style="left: {currentTime * zoom}px"></div>
        </div>
      </div>

      {#each getSortedTracks() as track, index}
        {@const sortedTracks = getSortedTracks()}
        {@const prevTrack = index > 0 ? sortedTracks[index - 1] : null}
        {@const isNewSection = prevTrack && prevTrack.type !== track.type}
        {#if isNewSection}
          <div class="track-section-separator">
            <span class="separator-label">{track.type === 'audio' ? '音声トラック' : '画像トラック'}</span>
          </div>
        {/if}
        <div class="track" class:hidden-track={!track.visible} class:locked-track={track.locked} class:image-track={track.type === 'image'} class:audio-track={track.type === 'audio'} style="height: {getTrackHeight(track.id)}px">
          <div class="track-header" class:image={track.type === 'image'} class:audio={track.type === 'audio'}>
            <div class="track-info">
              <span class="track-order">{index}</span>
              <span class="track-name">{track.name}</span>
              <span class="track-type-badge" class:image={track.type === 'image'} class:audio={track.type === 'audio'}>{trackTypeNames[track.type]}</span>
            </div>
            <div class="track-controls">
              <button class="track-ctrl-btn" class:active={track.visible} onclick={() => toggleTrackVisibility(track.id)} title="表示/非表示">
                {track.visible ? '👁' : '👁‍🗨'}
              </button>
              <button class="track-ctrl-btn" class:active={!track.muted} onclick={() => toggleTrackMute(track.id)} title="ミュート">
                {track.muted ? '🔇' : '🔊'}
              </button>
              <button class="track-ctrl-btn" class:active={track.locked} onclick={() => toggleTrackLock(track.id)} title="ロック">
                {track.locked ? '🔒' : '🔓'}
              </button>
              <button class="track-ctrl-btn" onclick={() => moveTrackUp(track.id)} title="上に移動（背面へ）">↑</button>
              <button class="track-ctrl-btn" onclick={() => moveTrackDown(track.id)} title="下に移動（手前へ）">↓</button>
              <button class="track-ctrl-btn delete" onclick={() => deleteTrack(track.id)} title="削除">×</button>
            </div>
          </div>
          <div class="track-clips" style="width: {getTimelineDisplayDuration() * zoom}px; height: {getTrackHeight(track.id)}px" onclick={(e) => {
            if (track.locked) return;
            const rect = e.currentTarget.getBoundingClientRect();
            currentTime = (e.clientX - rect.left) / zoom;
          }}>
            {#each track.clips as clip}
              {@const media = project.mediaItems.find(m => m.id === clip.mediaId)}
              <div
                class="clip"
                class:selected={selectedClipId === clip.id}
                class:image={track.type === 'image' && media?.type === 'image'}
                class:audio={track.type === 'audio'}
                class:subtitle={media?.type === 'subtitle'}
                style="left: {clip.startTime * zoom}px; width: {clip.duration * zoom}px"
                onclick={(e) => { e.stopPropagation(); if (!track.locked) selectedClipId = clip.id; }}
                title={media?.type === 'subtitle' ? media.text : getMediaName(clip.mediaId)}
              >
                {media?.type === 'subtitle' ? media.text : getMediaName(clip.mediaId)}
              </div>
            {/each}
          </div>
          <!-- トラックリサイズハンドル -->
          <div
            class="track-resize-handle"
            onmousedown={(e) => startTrackResize(e, track.id)}
            role="separator"
            aria-orientation="horizontal"
          ></div>
        </div>
      {/each}
    </div>
  </section>
</div>

<style>
  /* エクスポートダイアログ */
  .dialog-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .dialog {
    background: #1e1e2e;
    border: 1px solid #313244;
    border-radius: 12px;
    padding: 24px;
    min-width: 400px;
    max-width: 500px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  }

  .dialog h2 {
    margin: 0 0 20px;
    color: #cba6f7;
    font-size: 18px;
  }

  .dialog-content {
    margin-bottom: 24px;
  }

  .form-group {
    margin-bottom: 16px;
  }

  .form-group label {
    display: block;
    margin-bottom: 8px;
    color: #a6adc8;
    font-size: 13px;
  }

  .form-group select {
    width: 100%;
    padding: 10px 12px;
    background: #313244;
    border: 1px solid #45475a;
    border-radius: 6px;
    color: #cdd6f4;
    font-size: 14px;
    cursor: pointer;
  }

  .checkbox-group {
    background: #181825;
    padding: 12px 16px;
    border-radius: 8px;
  }

  .checkbox-label {
    display: flex !important;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    margin-bottom: 4px !important;
  }

  .checkbox-label input[type="checkbox"] {
    width: 18px;
    height: 18px;
    accent-color: #a6e3a1;
    cursor: pointer;
  }

  .checkbox-label span {
    color: #cdd6f4;
    font-weight: 500;
  }

  .checkbox-hint {
    margin: 0;
    font-size: 11px;
    color: #6c7086;
    padding-left: 28px;
  }

  .form-group select:focus {
    outline: none;
    border-color: #89b4fa;
  }

  .export-info {
    background: #181825;
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 13px;
  }

  .export-info p {
    margin: 6px 0;
    color: #a6adc8;
  }

  .export-info .note {
    margin-top: 12px;
    font-size: 11px;
    color: #6c7086;
    line-height: 1.5;
  }

  .dialog-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }

  .dialog-actions button {
    padding: 10px 20px;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    font-size: 14px;
  }

  .cancel-btn {
    background: #45475a;
    color: #cdd6f4;
  }

  .cancel-btn:hover {
    background: #585b70;
  }

  .confirm-btn {
    background: #a6e3a1;
    color: #1e1e2e;
  }

  .confirm-btn:hover {
    background: #94e2d5;
  }

  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #1e1e2e;
    color: #cdd6f4;
    font-size: 13px;
    overflow: hidden;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 16px;
    background: #181825;
    border-bottom: 1px solid #313244;
  }

  header h1 {
    font-size: 16px;
    color: #cba6f7;
  }

  .controls {
    display: flex;
    gap: 16px;
    align-items: center;
  }

  .controls button {
    padding: 6px 12px;
    background: #89b4fa;
    color: #1e1e2e;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
  }

  .controls button:hover {
    background: #b4befe;
  }

  .time {
    font-family: monospace;
    color: #a6adc8;
  }

  /* 再生速度コントロール */
  .speed-control {
    display: flex;
    gap: 2px;
    background: #313244;
    border-radius: 4px;
    padding: 2px;
  }

  .speed-btn {
    padding: 4px 8px !important;
    font-size: 11px !important;
    background: transparent !important;
    color: #a6adc8 !important;
    border-radius: 3px !important;
  }

  .speed-btn:hover {
    background: #45475a !important;
    color: #cdd6f4 !important;
  }

  .speed-btn.active {
    background: #fab387 !important;
    color: #1e1e2e !important;
  }

  .main {
    flex: 1;
    display: flex;
    overflow: hidden;
    min-height: 200px; /* 最小高さを設定 */
  }

  .media-panel, .property-panel {
    width: 200px;
    background: #181825;
    border-right: 1px solid #313244;
    display: flex;
    flex-direction: column;
  }

  .property-panel {
    border-right: none;
    border-left: 1px solid #313244;
  }

  .media-panel h2, .property-panel h2 {
    padding: 8px 12px;
    font-size: 12px;
    background: #11111b;
    color: #a6adc8;
  }

  .media-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  .media-item {
    padding: 8px;
    background: #313244;
    border-radius: 4px;
    margin-bottom: 4px;
    cursor: pointer;
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .media-item:hover {
    background: #45475a;
  }

  .media-item .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .empty {
    color: #6c7086;
    text-align: center;
    padding: 20px;
    font-size: 12px;
  }

  .preview-panel {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #11111b;
  }

  .preview-container {
    text-align: center;
  }

  .preview-container canvas {
    background: #000;
    border-radius: 4px;
  }

  .play-btn {
    background: #a6e3a1 !important;
  }

  .play-btn:hover {
    background: #94e2d5 !important;
  }

  .export-btn {
    background: #cba6f7 !important;
  }

  .export-btn:hover {
    background: #f5c2e7 !important;
  }

  .export-btn:disabled {
    background: #6c7086 !important;
    cursor: not-allowed;
  }

  .save-btn {
    background: #89b4fa !important;
  }

  .save-btn:hover {
    background: #b4befe !important;
  }

  .load-btn {
    background: #94e2d5 !important;
  }

  .load-btn:hover {
    background: #a6e3a1 !important;
  }

  .import-project-btn {
    background: #fab387 !important;
  }

  .import-project-btn:hover {
    background: #f9e2af !important;
  }

  .import-project-btn:disabled {
    background: #6c7086 !important;
    cursor: not-allowed;
  }

  .subtitle-btn {
    background: #6c7086 !important;
  }

  .subtitle-btn:hover {
    background: #7c8096 !important;
  }

  .subtitle-btn.active {
    background: #f9e2af !important;
  }

  .subtitle-btn.active:hover {
    background: #f5c2e7 !important;
  }

  .subtitle-count {
    font-size: 11px;
    color: #a6adc8;
    background: #313244;
    padding: 4px 8px;
    border-radius: 4px;
  }

  .property-panel button {
    margin: 8px;
    padding: 8px;
    background: #f38ba8;
    color: #1e1e2e;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  .timeline {
    background: #181825;
    border-top: 1px solid #313244;
    display: flex;
    flex-direction: column;
    position: relative;
    flex-shrink: 0; /* 縮小しない */
  }

  .timeline-resize-handle {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 8px;
    background: #313244;
    cursor: ns-resize;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .timeline-resize-handle::after {
    content: '';
    width: 40px;
    height: 4px;
    background: #6c7086;
    border-radius: 2px;
  }

  .timeline-resize-handle:hover {
    background: #89b4fa;
  }

  .timeline-resize-handle:hover::after {
    background: #1e1e2e;
  }

  .timeline-header {
    padding: 4px 8px;
    background: #11111b;
    display: flex;
    justify-content: flex-end;
  }

  .zoom-control {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .zoom-control button {
    width: 24px;
    height: 24px;
    background: #313244;
    border: none;
    color: #cdd6f4;
    border-radius: 4px;
    cursor: pointer;
  }

  .timeline-content {
    flex: 1;
    overflow-x: auto;
    overflow-y: auto;
  }

  /* トラックセクションの区切り線 */
  .track-section-separator {
    display: flex;
    align-items: center;
    height: 24px;
    background: linear-gradient(90deg, #fab387 0%, #f9e2af 50%, #fab387 100%);
    border-top: 2px solid #fab387;
    border-bottom: 2px solid #fab387;
    padding: 0 12px;
  }

  .separator-label {
    font-size: 11px;
    font-weight: 600;
    color: #1e1e2e;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .ruler-row {
    display: flex;
    border-bottom: 1px solid #313244;
  }

  .ruler-header {
    width: 160px;
    min-width: 160px;
    height: 24px;
    background: #11111b;
  }

  .ruler {
    position: relative;
    height: 24px;
    background: #11111b;
    flex: 1;
  }

  .ruler .mark {
    position: absolute;
    font-size: 10px;
    color: #6c7086;
    border-left: 1px solid #313244;
    padding-left: 4px;
    height: 100%;
    line-height: 24px;
  }

  .playhead {
    position: absolute;
    top: 0;
    width: 2px;
    height: 100%;
    background: #f38ba8;
    z-index: 10;
  }

  .track {
    display: flex;
    border-bottom: 1px solid #313244;
    position: relative;
    min-height: 30px;
  }

  .track-header {
    width: 80px;
    min-width: 80px;
    padding: 8px;
    background: #11111b;
    font-size: 11px;
    display: flex;
    align-items: center;
  }

  .track-clips {
    position: relative;
    background: #1e1e2e;
    cursor: pointer;
    min-width: 100%;
    flex: 1;
  }

  .track-resize-handle {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 6px;
    background: transparent;
    cursor: ns-resize;
    z-index: 15;
  }

  .track-resize-handle:hover {
    background: #fab387;
  }

  .clip {
    position: absolute;
    top: 4px;
    height: calc(100% - 8px);
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }

  /* 画像クリップ（YMM4方式） */
  .clip.image {
    background: linear-gradient(135deg, #89b4fa, #74c7ec);
    color: #1e1e2e;
  }

  /* 音声クリップ */
  .clip.audio {
    background: linear-gradient(135deg, #a6e3a1, #94e2d5);
    color: #1e1e2e;
  }

  /* 字幕クリップ（画像トラック内） */
  .clip.subtitle {
    background: linear-gradient(135deg, #f9e2af, #fab387);
    color: #1e1e2e;
    font-size: 9px;
    font-weight: 500;
  }

  .clip.selected {
    box-shadow: 0 0 0 2px #f38ba8;
  }

  /* シークバー */
  .seekbar-container {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 16px;
    background: #11111b;
    border-bottom: 1px solid #313244;
  }

  .seekbar-time {
    font-family: monospace;
    font-size: 12px;
    color: #a6adc8;
    min-width: 70px;
  }

  .seekbar {
    flex: 1;
    height: 6px;
    -webkit-appearance: none;
    appearance: none;
    background: #313244;
    border-radius: 3px;
    cursor: pointer;
  }

  .seekbar::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    background: #f38ba8;
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 0 4px rgba(243, 139, 168, 0.5);
  }

  .seekbar::-moz-range-thumb {
    width: 14px;
    height: 14px;
    background: #f38ba8;
    border-radius: 50%;
    cursor: pointer;
    border: none;
  }

  /* トラック追加ボタン（YMM4方式） */
  .add-track-container {
    display: flex;
    gap: 8px;
  }

  .add-track-btn {
    padding: 4px 12px;
    font-weight: 600;
    font-size: 12px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  .add-track-btn.image-track-btn {
    background: #89b4fa !important;
    color: #1e1e2e;
  }

  .add-track-btn.image-track-btn:hover {
    background: #74c7ec !important;
  }

  .add-track-btn.audio-track-btn {
    background: #a6e3a1 !important;
    color: #1e1e2e;
  }

  .add-track-btn.audio-track-btn:hover {
    background: #94e2d5 !important;
  }

  /* トラックヘッダー拡張 */
  .track-header {
    width: 160px;
    min-width: 160px;
    padding: 4px 8px;
    background: #11111b;
    font-size: 11px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  /* 画像トラックヘッダー */
  .track-header.image {
    background: #1f2a3d;
  }

  /* 音声トラックヘッダー */
  .track-header.audio {
    background: #1f3d2a;
  }

  /* トラック番号（order表示） */
  .track-order {
    font-size: 10px;
    color: #6c7086;
    min-width: 16px;
    text-align: center;
    background: #313244;
    border-radius: 3px;
    padding: 1px 4px;
  }

  /* トラックタイプバッジ */
  .track-type-badge.image {
    background: #89b4fa;
    color: #1e1e2e;
  }

  .track-type-badge.audio {
    background: #a6e3a1;
    color: #1e1e2e;
  }

  .track-info {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .track-name {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .track-type-badge {
    font-size: 9px;
    padding: 1px 4px;
    border-radius: 3px;
    background: #313244;
    color: #a6adc8;
  }

  .track-controls {
    display: flex;
    gap: 2px;
  }

  .track-ctrl-btn {
    width: 20px;
    height: 20px;
    padding: 0;
    background: #313244;
    border: none;
    border-radius: 3px;
    color: #6c7086;
    cursor: pointer;
    font-size: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .track-ctrl-btn:hover {
    background: #45475a;
    color: #cdd6f4;
  }

  .track-ctrl-btn.active {
    color: #a6e3a1;
  }

  .track-ctrl-btn.delete {
    color: #f38ba8;
  }

  .track-ctrl-btn.delete:hover {
    background: #f38ba8;
    color: #1e1e2e;
  }

  /* 非表示/ロック状態のトラック */
  .hidden-track {
    opacity: 0.5;
  }

  .locked-track .track-clips {
    cursor: not-allowed;
    background: repeating-linear-gradient(
      45deg,
      #1e1e2e,
      #1e1e2e 10px,
      #232333 10px,
      #232333 20px
    );
  }

  /* 画像トラック/音声トラックの区別 */
  .image-track {
    background: #1a1f2e;
  }

  .audio-track {
    background: #1a2e1f;
  }
</style>
