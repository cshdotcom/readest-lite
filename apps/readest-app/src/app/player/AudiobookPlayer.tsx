'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { getAccessToken } from '@/utils/access';
import { getAPIBaseUrl } from '@/services/environment';
import {
  MdPlayArrow,
  MdPause,
  MdSkipNext,
  MdSkipPrevious,
  MdVolumeUp,
  MdVolumeOff,
  MdSpeed,
  MdError,
} from 'react-icons/md';

interface AudioChapter {
  index: number;
  title: string;
  fileKey: string;
  fileSize: number;
  fileName: string;
}

interface AudiobookPlayerProps {
  bookHash: string;
  bookTitle: string;
  bookAuthor?: string;
  coverImageUrl?: string | null;
  chapters: AudioChapter[];
  onClose: () => void;
}

function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) return '--:--';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export default function AudiobookPlayer({
  bookHash,
  bookTitle,
  bookAuthor,
  coverImageUrl,
  chapters,
  onClose,
}: AudiobookPlayerProps) {
  const _ = useTranslation();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 保存每章的进度，切换章节时记录上一章的位置
  const positionsRef = useRef<Record<number, number>>({});
  // 从 localStorage 恢复进度
  const PROGRESS_KEY = `audiobook-progress:${bookHash}`;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PROGRESS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { index: number; time: number; positions: Record<number, number> };
        if (parsed && typeof parsed.index === 'number' && parsed.index < chapters.length) {
          setCurrentIndex(parsed.index);
          positionsRef.current = parsed.positions || {};
        }
      }
    } catch {
      /* ignore */
    }
  }, [PROGRESS_KEY, chapters.length]);

  // 当前章节的流式 URL — 带 token，因为 <audio> 无法设置 Authorization header
  const [accessToken, setAccessToken] = useState<string>('');
  useEffect(() => {
    void (async () => {
      const t = await getAccessToken();
      setAccessToken(t || '');
    })();
  }, []);

  const currentChapter = chapters[currentIndex];
  const streamUrl = currentChapter && accessToken
    ? `${getAPIBaseUrl()}/audiobook/stream/${bookHash}?fileKey=${encodeURIComponent(currentChapter.fileKey)}&token=${encodeURIComponent(accessToken)}`
    : '';

  // 当切换章节时，恢复进度
  useEffect(() => {
    if (!audioRef.current || !currentChapter) return;
    setLoading(true);
    setError(null);
    // 恢复该章的位置
    const savedPos = positionsRef.current[currentIndex] || 0;
    if (savedPos > 0) {
      audioRef.current.addEventListener('loadedmetadata', () => {
        if (audioRef.current) {
          try {
            audioRef.current.currentTime = Math.min(savedPos, audioRef.current.duration || savedPos);
          } catch {
            /* ignore */
          }
        }
      }, { once: true });
    }
  }, [currentIndex, currentChapter]);

  // 加载时设置 Authorization header — 由于 HTML5 audio 不支持自定义 header，
  // 把 token 加到 URL（stream endpoint 同时接受 Authorization header 和 ?token= query）

  // 监听 audio 事件
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      positionsRef.current[currentIndex] = audio.currentTime;
    };
    const onDurationChange = () => setDuration(audio.duration || 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onWaiting = () => setLoading(true);
    const onPlaying = () => setLoading(false);
    const onError = () => {
      setError(_('Failed to load audio. The file may be missing or unsupported.'));
      setLoading(false);
      setIsPlaying(false);
    };
    const onEnded = () => {
      // 自动播放下一章
      if (currentIndex < chapters.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        setIsPlaying(false);
      }
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('error', onError);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('ended', onEnded);
    };
  }, [_, currentIndex, chapters.length]);

  // 定期保存进度
  useEffect(() => {
    const interval = setInterval(() => {
      const audio = audioRef.current;
      if (!audio) return;
      localStorage.setItem(
        PROGRESS_KEY,
        JSON.stringify({
          index: currentIndex,
          time: audio.currentTime,
          positions: positionsRef.current,
        }),
      );
    }, 5000);
    return () => clearInterval(interval);
  }, [PROGRESS_KEY, currentIndex]);

  const handlePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play().catch((e) => {
        console.error('play failed', e);
        setError(_('Failed to play. Check your authentication.'));
      });
    } else {
      audio.pause();
    }
  }, [_]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const newTime = Number(e.target.value);
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  }, []);

  const handleVolume = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const v = Number(e.target.value);
    audio.volume = v;
    setVolume(v);
  }, []);

  const handleRate = useCallback(() => {
    const rates = [0.75, 1, 1.25, 1.5, 1.75, 2];
    const currentRateIdx = rates.indexOf(playbackRate);
    const nextRate = rates[(currentRateIdx + 1) % rates.length]!;
    setPlaybackRate(nextRate);
    if (audioRef.current) audioRef.current.playbackRate = nextRate;
  }, [playbackRate]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  }, [currentIndex]);

  const handleNext = useCallback(() => {
    if (currentIndex < chapters.length - 1) setCurrentIndex(currentIndex + 1);
  }, [currentIndex, chapters.length]);

  const handleChapterSelect = useCallback((index: number) => {
    setCurrentIndex(index);
  }, []);

  if (chapters.length === 0) {
    return (
      <div className='flex min-h-screen flex-col items-center justify-center bg-base-100 p-6'>
        <MdError className='mb-4 text-6xl text-base-content/30' />
        <h2 className='text-xl font-bold mb-2'>{_('No audio files found')}</h2>
        <p className='text-sm text-base-content/60 mb-4 text-center max-w-md'>
          {_('This book has no audio files. See the tutorial on how to add audiobooks.')}
        </p>
        <button onClick={onClose} className='btn btn-primary'>
          {_('Go Back')}
        </button>
      </div>
    );
  }

  return (
    <div className='flex min-h-screen flex-col bg-base-100'>
      {/* 顶栏 */}
      <div className='flex items-center gap-3 p-4 border-b border-base-200'>
        <button onClick={onClose} className='btn btn-ghost btn-sm btn-square' title={_('Go Back')}>
          <MdSkipPrevious className='w-5 h-5 rotate-90' />
        </button>
        <div className='flex-1 min-w-0'>
          <h1 className='font-bold truncate'>{bookTitle}</h1>
          {bookAuthor && <p className='text-xs opacity-60 truncate'>{bookAuthor}</p>}
        </div>
        <span className='badge badge-sm badge-ghost'>
          {currentIndex + 1} / {chapters.length}
        </span>
      </div>

      {/* 主体：左侧封面 + 右侧章节列表 */}
      <div className='flex-1 grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4 p-4 overflow-hidden'>
        {/* 封面 + 控制器 */}
        <div className='flex flex-col gap-3'>
          {coverImageUrl ? (
            <img
              src={coverImageUrl}
              alt={bookTitle}
              className='w-full aspect-square object-cover rounded-lg shadow-md'
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className='w-full aspect-square bg-base-200 rounded-lg flex items-center justify-center'>
              <MdPlayArrow className='w-24 h-24 opacity-30' />
            </div>
          )}

          {/* 当前章节信息 */}
          <div className='card bg-base-200 p-3 text-sm'>
            <p className='text-xs opacity-60 mb-1'>{_('Now Playing')}</p>
            <p className='font-medium truncate'>{currentChapter?.title}</p>
          </div>
        </div>

        {/* 章节列表 */}
        <div className='card bg-base-200 overflow-hidden flex flex-col max-h-[60vh] md:max-h-none'>
          <div className='p-3 border-b border-base-300 font-semibold'>
            {_('Chapters')} ({chapters.length})
          </div>
          <div className='flex-1 overflow-y-auto p-2 space-y-1'>
            {chapters.map((ch) => (
              <button
                key={ch.index}
                onClick={() => handleChapterSelect(ch.index)}
                className={`w-full text-left p-2 rounded text-sm transition-colors ${
                  ch.index === currentIndex
                    ? 'bg-primary text-primary-content'
                    : 'hover:bg-base-300'
                }`}
              >
                <div className='flex items-center gap-2'>
                  <span className='text-xs opacity-70 w-6'>
                    {ch.index === currentIndex && isPlaying ? '▶' : ch.index + 1}
                  </span>
                  <span className='flex-1 truncate'>{ch.title}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 底部播放器控制条 */}
      <div className='border-t border-base-200 bg-base-100 p-4 sticky bottom-0'>
        <div className='max-w-3xl mx-auto'>
          {/* 进度条 */}
          <div className='flex items-center gap-3 mb-2'>
            <span className='text-xs opacity-60 tabular-nums w-12'>{formatTime(currentTime)}</span>
            <input
              type='range'
              min={0}
              max={duration || 0}
              value={currentTime}
              onChange={handleSeek}
              className='range range-xs flex-1'
              disabled={!duration}
              aria-label={_('Seek')}
            />
            <span className='text-xs opacity-60 tabular-nums w-12 text-right'>
              {formatTime(duration)}
            </span>
          </div>

          {/* 控制按钮 */}
          <div className='flex items-center justify-center gap-4 mb-2'>
            <button
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className='btn btn-ghost btn-circle btn-sm disabled:opacity-30'
              title={_('Previous chapter')}
            >
              <MdSkipPrevious className='w-5 h-5' />
            </button>

            <button
              onClick={handlePlayPause}
              className='btn btn-primary btn-circle btn-lg'
              title={isPlaying ? _('Pause') : _('Play')}
            >
              {loading ? (
                <span className='loading loading-spinner' />
              ) : isPlaying ? (
                <MdPause className='w-7 h-7' />
              ) : (
                <MdPlayArrow className='w-7 h-7' />
              )}
            </button>

            <button
              onClick={handleNext}
              disabled={currentIndex >= chapters.length - 1}
              className='btn btn-ghost btn-circle btn-sm disabled:opacity-30'
              title={_('Next chapter')}
            >
              <MdSkipNext className='w-5 h-5' />
            </button>
          </div>

          {/* 音量 + 速度 */}
          <div className='flex items-center justify-center gap-4'>
            <div className='flex items-center gap-2'>
              <button
                onClick={() => setVolume(volume > 0 ? 0 : 1)}
                className='btn btn-ghost btn-xs btn-square'
                title={volume > 0 ? _('Mute') : _('Unmute')}
              >
                {volume > 0 ? <MdVolumeUp className='w-4 h-4' /> : <MdVolumeOff className='w-4 h-4' />}
              </button>
              <input
                type='range'
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={handleVolume}
                className='range range-xs w-24'
                aria-label={_('Volume')}
              />
            </div>
            <button
              onClick={handleRate}
              className='btn btn-ghost btn-xs gap-1'
              title={_('Playback speed')}
            >
              <MdSpeed className='w-4 h-4' />
              {playbackRate}×
            </button>
          </div>
        </div>
      </div>

      {/* 隐藏的 audio 元素，token 通过 stream URL query 传递 */}
      <audio
        ref={audioRef}
        src={streamUrl || undefined}
        preload='metadata'
      />

      {error && (
        <div className='toast toast-end z-50'>
          <div className='alert alert-error'>
            <span>{error}</span>
          </div>
        </div>
      )}
    </div>
  );
}
