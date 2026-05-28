import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getMediaById, getStreamUrl, getProgress, updateProgress } from '../api/client';
import mpegts from 'mpegts.js';
import { 
  Play, Pause, Volume2, VolumeX, Maximize, Minimize, 
  ArrowLeft, List, RotateCcw, RotateCw, Search, X, HelpCircle,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function PlayerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const progressInterval = useRef(null);
  const scrubberRef = useRef(null);
  const volumeRailRef = useRef(null);
  const clickTimeout = useRef(null);
  const lastTapRef = useRef(0);
  const touchTimeoutRef = useRef(null);
  const gestureTimeout = useRef(null);
  const volumeHudTimeout = useRef(null);
  const countdownInterval = useRef(null);
  const episodesListRef = useRef(null);

  const [movie, setMovie] = useState(null);
  const [loading, setLoading] = useState(true);

  // Player State
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showEpisodes, setShowEpisodes] = useState(false);
  
  const [initialSeekDone, setInitialSeekDone] = useState(false);

  // Advanced Custom Player States
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [gesture, setGesture] = useState({ type: '', active: false });
  const [isMouseDownScrubber, setIsMouseDownScrubber] = useState(false);
  const [isDraggingVolume, setIsDraggingVolume] = useState(false);
  const [tooltipTime, setTooltipTime] = useState('0:00');
  const [tooltipLeft, setTooltipLeft] = useState(0);
  const [showTooltip, setShowTooltip] = useState(false);

  // Episodes List Advanced State
  const [autoNext, setAutoNext] = useState(true);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [episodeSearchQuery, setEpisodeSearchQuery] = useState('');

  // Interesting UX Extra States
  const [volumeHud, setVolumeHud] = useState({ visible: false, value: 1 });
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [countdownActive, setCountdownActive] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState(10);

  // Transcoded seek handling state
  const [streamStartOffset, setStreamStartOffset] = useState(0);

  const isIOS = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }, []);

  const isTranscoded = useMemo(() => {
    if (!movie) return false;
    const nativeMimes = ['video/mp4', 'video/webm', 'video/ogg', 'video/mp2t'];
    let needsTranscode = !nativeMimes.includes(movie.mimeType);
    if (movie.mimeType === 'video/mp2t' && isIOS) {
      needsTranscode = true;
    }
    return needsTranscode;
  }, [movie, isIOS]);

  const videoSrc = useMemo(() => {
    if (!movie) return '';
    const options = {};
    if (isTranscoded) {
      options.transcode = true;
      if (streamStartOffset > 0) {
        options.start = streamStartOffset;
      }
    }
    return getStreamUrl(id, options);
  }, [movie, id, isTranscoded, streamStartOffset]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (clickTimeout.current) clearTimeout(clickTimeout.current);
      if (touchTimeoutRef.current) clearTimeout(touchTimeoutRef.current);
    };
  }, []);

  // Fetch Media Details
  useEffect(() => {
    async function init() {
      setLoading(true);
      setInitialSeekDone(false);
      setCountdownActive(false);
      setStreamStartOffset(0); // Reset stream offset for new video
      try {
        const movieData = await getMediaById(id);
        setMovie(movieData);
      } catch (err) {
        console.error('Failed to init player:', err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [id]);

  // Set selected season on load
  useEffect(() => {
    if (movie && movie.type === 'tv' && movie.seasonNumber) {
      setSelectedSeason(movie.seasonNumber);
    }
  }, [movie]);

  // MSE mpegts player setup
  useEffect(() => {
    let player = null;
    if (movie && movie.mimeType === 'video/mp2t' && videoRef.current && !isIOS) {
      if (mpegts.getFeatureList().mseLivePlayback) {
        player = mpegts.createPlayer({
          type: 'm2ts',
          isLive: false,
          url: getStreamUrl(id),
          duration: movie.duration ? movie.duration * 1000 : undefined,
          filesize: movie.fileSize || undefined
        }, {
          enableWorker: true,
          lazyLoad: true,
          lazyLoadMaxDuration: 30,
          seekType: 'range',
          accurateSeek: true,
          enableStashBuffer: false,
          liveBufferLatencyChasing: true
        });
        player.attachMediaElement(videoRef.current);
        player.load();
        player.play();
      }
    }
    return () => {
      if (player) {
        player.destroy();
      }
    };
  }, [movie, id, isIOS]);

  // Restore Watch Progress
  useEffect(() => {
    if (movie && videoRef.current && !initialSeekDone && duration > 0) {
      getProgress(id).then(prog => {
        if (prog && prog.currentTime > 5 && prog.currentTime < duration - 10) {
          const seekTime = Math.max(0, prog.currentTime - 3);
          performSeek(seekTime);
        }
        setInitialSeekDone(true);
      }).catch(console.error);
    }
  }, [movie, id, initialSeekDone, duration, isTranscoded]);

  // Sync Watch Progress
  useEffect(() => {
    if (!initialSeekDone || !movie) return;
    
    progressInterval.current = setInterval(() => {
      if (videoRef.current && !videoRef.current.paused && videoRef.current.currentTime > 0) {
        updateProgress(id, videoRef.current.currentTime, videoRef.current.duration).catch(console.error);
      }
    }, 10000);
    
    return () => clearInterval(progressInterval.current);
  }, [id, initialSeekDone, movie]);

  // Apply Playback Speed
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed, id]);

  // Global mouse handlers for scrubber/volume dragging
  useEffect(() => {
    const handleMouseUp = () => {
      setIsMouseDownScrubber(false);
      setIsDraggingVolume(false);
    };

    const handleGlobalMouseMove = (e) => {
      if (isMouseDownScrubber) {
        handleScrubberInteraction(e);
      }
      if (isDraggingVolume) {
        handleVolumeInteraction(e);
      }
    };

    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleGlobalMouseMove);
    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleGlobalMouseMove);
    };
  }, [isMouseDownScrubber, isDraggingVolume, duration]);

  // Scroll wheel volume adjustment
  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.05 : -0.05;
    const nextVolume = Math.max(0, Math.min(volume + delta, 1));
    
    setVolume(nextVolume);
    if (videoRef.current) {
      videoRef.current.volume = nextVolume;
      videoRef.current.muted = nextVolume === 0;
      setIsMuted(nextVolume === 0);
    }
    
    if (volumeHudTimeout.current) clearTimeout(volumeHudTimeout.current);
    setVolumeHud({ visible: true, value: nextVolume });
    volumeHudTimeout.current = setTimeout(() => {
      setVolumeHud(prev => ({ ...prev, visible: false }));
    }, 1500);
  };

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
    }
    return () => {
      if (container) {
        container.removeEventListener('wheel', handleWheel);
      }
    };
  }, [volume]);

  // Keyboard controls listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;

      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'arrowleft':
          e.preventDefault();
          seekRelative(-10, false);
          break;
        case 'arrowright':
          e.preventDefault();
          seekRelative(10, false);
          break;
        case 'arrowup':
          e.preventDefault();
          adjustVolume(0.05);
          break;
        case 'arrowdown':
          e.preventDefault();
          adjustVolume(-0.05);
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
        case '?':
        case '/':
          if (e.key === '?') {
            e.preventDefault();
            setShowShortcuts(prev => !prev);
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, isMuted, volume, duration]);

  // Sync fullscreen state with native browser fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!(
        document.fullscreenElement ||
        document.webkitFullscreenElement
      ));
    };

    const handleWebKitBeginFullscreen = () => {
      setIsFullscreen(true);
    };

    const handleWebKitEndFullscreen = () => {
      setIsFullscreen(false);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    const video = videoRef.current;
    if (video) {
      video.addEventListener('webkitbeginfullscreen', handleWebKitBeginFullscreen);
      video.addEventListener('webkitendfullscreen', handleWebKitEndFullscreen);
    }

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      if (video) {
        video.removeEventListener('webkitbeginfullscreen', handleWebKitBeginFullscreen);
        video.removeEventListener('webkitendfullscreen', handleWebKitEndFullscreen);
      }
    };
  }, [loading, id]);

  // Controls auto-hide timer
  useEffect(() => {
    let timeout;
    
    const resetTimer = () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (isPlaying && !showEpisodes && !showSpeedMenu && !isMouseDownScrubber && !isDraggingVolume && !showShortcuts && !countdownActive) {
          setShowControls(false);
        }
      }, 1500);
    };

    if (showControls) {
      resetTimer();
    }

    const handleActivity = (e) => {
      if (e && e.type === 'touchstart' && !showControls) {
        return;
      }
      if (!showControls) {
        setShowControls(true);
      }
      resetTimer();
    };

    document.addEventListener('mousemove', handleActivity);
    document.addEventListener('keydown', handleActivity);
    document.addEventListener('touchstart', handleActivity);

    return () => {
      if (timeout) clearTimeout(timeout);
      document.removeEventListener('mousemove', handleActivity);
      document.removeEventListener('keydown', handleActivity);
      document.removeEventListener('touchstart', handleActivity);
    };
  }, [showControls, isPlaying, showEpisodes, showSpeedMenu, isMouseDownScrubber, isDraggingVolume, showShortcuts, countdownActive]);

  // Next Episode Selector
  const nextMedia = useMemo(() => {
    if (!movie) return null;
    if (movie.parts && movie.parts.length > 0) {
      const currentPartIndex = movie.parts.findIndex(p => p._id === id);
      if (currentPartIndex !== -1 && currentPartIndex < movie.parts.length - 1) {
        return movie.parts[currentPartIndex + 1];
      }
    } else if (movie.type === 'tv' && movie.episodes) {
      const currentIdx = movie.episodes.findIndex(e => e._id === id);
      if (currentIdx !== -1 && currentIdx < movie.episodes.length - 1) {
        return movie.episodes[currentIdx + 1];
      }
    }
    return null;
  }, [movie, id]);

  // Next episode countdown logic
  useEffect(() => {
    if (!movie || !nextMedia || !autoNext || countdownActive) return;
    
    const timeLeft = duration - currentTime;
    if (duration > 30 && timeLeft <= 15 && timeLeft > 0.5) {
      setCountdownActive(true);
      setCountdownSeconds(10);
    }
  }, [currentTime, duration, movie, nextMedia, autoNext, countdownActive]);

  useEffect(() => {
    if (countdownActive) {
      countdownInterval.current = setInterval(() => {
        setCountdownSeconds(prev => {
          if (prev <= 1) {
            clearInterval(countdownInterval.current);
            setCountdownActive(false);
            playNextEpisode();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (countdownInterval.current) clearInterval(countdownInterval.current);
    }
    return () => {
      if (countdownInterval.current) clearInterval(countdownInterval.current);
    };
  }, [countdownActive, nextMedia]);

  const playNextEpisode = () => {
    if (nextMedia) {
      setCountdownActive(false);
      navigate(`/play/${nextMedia._id}`);
    }
  };

  const cancelCountdown = () => {
    setCountdownActive(false);
    setAutoNext(false); // Stop countdown for current playback session
  };

  // Video Events
  function performSeek(seekTime) {
    if (isTranscoded) {
      setStreamStartOffset(seekTime);
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
      }
    } else {
      if (videoRef.current) {
        videoRef.current.currentTime = seekTime;
      }
    }
    setCurrentTime(seekTime);
    setProgress((seekTime / duration) * 100);
  }

  const handleSeeked = () => {
    if (isTranscoded && videoRef.current) {
      const targetTime = videoRef.current.currentTime;
      if (Math.abs(targetTime) > 1.5) {
        const absoluteSeekTime = streamStartOffset + targetTime;
        setStreamStartOffset(absoluteSeekTime);
        videoRef.current.currentTime = 0;
      }
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current && !isMouseDownScrubber) {
      const actualTime = isTranscoded ? (streamStartOffset + videoRef.current.currentTime) : videoRef.current.currentTime;
      setCurrentTime(actualTime);
      setProgress((actualTime / videoRef.current.duration) * 100);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      videoRef.current.playbackRate = playbackSpeed;
    }
  };

  const handleEnded = () => {
    if (countdownActive) return; // Managed by countdown timer
    
    if (!autoNext) return;

    if (movie && movie.parts && movie.parts.length > 0) {
      const currentPartIndex = movie.parts.findIndex(p => p._id === id);
      if (currentPartIndex !== -1 && currentPartIndex < movie.parts.length - 1) {
        navigate(`/play/${movie.parts[currentPartIndex + 1]._id}`);
      }
    } else if (movie && movie.type === 'tv' && movie.episodes) {
       const currentIdx = movie.episodes.findIndex(e => e._id === id);
       if (currentIdx !== -1 && currentIdx < movie.episodes.length - 1) {
         navigate(`/play/${movie.episodes[currentIdx + 1]._id}`);
       }
    }
  };

  // Playback Control Handlers
  const togglePlay = (showIndicator = true) => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
        setIsPlaying(true);
        if (showIndicator) triggerGestureIndicator('play');
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
        if (showIndicator) triggerGestureIndicator('pause');
      }
    }
  };

  const seekRelative = (seconds, showIndicator = true) => {
    if (videoRef.current) {
      const currentAbsoluteTime = isTranscoded ? (streamStartOffset + videoRef.current.currentTime) : videoRef.current.currentTime;
      const newAbsoluteTime = Math.max(0, Math.min(currentAbsoluteTime + seconds, duration));
      performSeek(newAbsoluteTime);
      if (showIndicator) {
        triggerGestureIndicator(seconds > 0 ? 'forward' : 'backward');
      }
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      const nextMuted = !isMuted;
      videoRef.current.muted = nextMuted;
      setIsMuted(nextMuted);
    }
  };

  const adjustVolume = (delta) => {
    if (videoRef.current) {
      const newVol = Math.max(0, Math.min(volume + delta, 1));
      setVolume(newVol);
      videoRef.current.volume = newVol;
      setIsMuted(newVol === 0);
      videoRef.current.muted = newVol === 0;

      if (volumeHudTimeout.current) clearTimeout(volumeHudTimeout.current);
      setVolumeHud({ visible: true, value: newVol });
      volumeHudTimeout.current = setTimeout(() => {
        setVolumeHud(prev => ({ ...prev, visible: false }));
      }, 1500);
    }
  };

  const resyncAudio = () => {
    if (videoRef.current) {
      const time = videoRef.current.currentTime;
      videoRef.current.pause();
      videoRef.current.currentTime = Math.max(0, time - 0.1);
      
      triggerGestureIndicator('sync');
      
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.play().then(() => {
            setIsPlaying(true);
          }).catch(console.error);
        }
      }, 100);
    }
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container || !video) return;

    const isCurrentlyFullscreen = !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      video.webkitDisplayingFullscreen
    );

    if (!isCurrentlyFullscreen) {
      if (container.requestFullscreen) {
        container.requestFullscreen().catch((err) => {
          if (video.webkitEnterFullscreen) {
            video.webkitEnterFullscreen();
          } else {
            console.error('Fullscreen request failed:', err);
          }
        });
      } else if (video.webkitEnterFullscreen) {
        video.webkitEnterFullscreen();
      } else if (video.requestFullscreen) {
        video.requestFullscreen().catch(console.error);
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(console.error);
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (video.webkitExitFullscreen) {
        video.webkitExitFullscreen();
      }
    }
  };

  // Interactive Custom Scrubber seek calculation
  const handleScrubberInteraction = (e) => {
    if (!scrubberRef.current || duration === 0) return;
    const rect = scrubberRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percentage = x / rect.width;
    const seekTime = percentage * duration;
    
    performSeek(seekTime);
  };

  const handleScrubberMouseDown = (e) => {
    setIsMouseDownScrubber(true);
    handleScrubberInteraction(e);
  };

  const handleScrubberMouseMove = (e) => {
    if (!scrubberRef.current || duration === 0) return;
    const rect = scrubberRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percentage = x / rect.width;
    const time = percentage * duration;
    
    setTooltipTime(formatTime(time));
    setTooltipLeft(x);
  };

  // Interactive custom volume bar
  const handleVolumeInteraction = (e) => {
    if (!volumeRailRef.current) return;
    const rect = volumeRailRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const newVol = x / rect.width;
    
    setVolume(newVol);
    if (videoRef.current) {
      videoRef.current.volume = newVol;
      videoRef.current.muted = newVol === 0;
      setIsMuted(newVol === 0);
    }
  };

  const handleVolumeMouseDown = (e) => {
    setIsDraggingVolume(true);
    handleVolumeInteraction(e);
  };

  // Double-tap and Single-tap click separator
  const handleVideoClick = () => {
    if (clickTimeout.current) {
      clearTimeout(clickTimeout.current);
      clickTimeout.current = null;
      toggleFullscreen();
    } else {
      clickTimeout.current = setTimeout(() => {
        setShowControls(prev => !prev);
        clickTimeout.current = null;
      }, 250);
    }
  };

  // Touch double-tap and single-tap handler
  const handleVideoTouch = (e) => {
    const isOverlayBackground = e.target.classList.contains('player-controls-overlay');
    const isVideoElement = e.target.classList.contains('custom-player-video');
    const isContainer = e.target.classList.contains('custom-player-container');
    
    if (!isOverlayBackground && !isVideoElement && !isContainer) {
      return;
    }

    e.preventDefault();

    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    
    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      if (touchTimeoutRef.current) {
        clearTimeout(touchTimeoutRef.current);
        touchTimeoutRef.current = null;
      }
      toggleFullscreen();
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
      touchTimeoutRef.current = setTimeout(() => {
        setShowControls(prev => !prev);
        touchTimeoutRef.current = null;
      }, 250);
    }
  };

  // Central pop animation gesture indicators
  const triggerGestureIndicator = (type) => {
    if (gestureTimeout.current) clearTimeout(gestureTimeout.current);
    setGesture({ type, active: true });
    gestureTimeout.current = setTimeout(() => {
      setGesture({ type: '', active: false });
    }, 800);
  };

  // Speed adjust selector
  const changeSpeed = (speed) => {
    setPlaybackSpeed(speed);
    setShowSpeedMenu(false);
  };

  // Helpers
  const formatTime = (time) => {
    if (isNaN(time)) return '0:00';
    const hours = Math.floor(time / 3600);
    const min = Math.floor((time % 3600) / 60);
    const sec = Math.floor(time % 60);
    
    if (hours > 0) {
      return `${hours}:${min < 10 ? '0' : ''}${min}:${sec < 10 ? '0' : ''}${sec}`;
    }
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  };

  const handleBack = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    }
    if (movie && movie.partNumber > 0 && movie.parts && movie.parts.length > 0) {
      navigate(`/movie/${movie.parts[0]._id}`);
    } else if (movie && movie.type === 'tv' && movie.episodes && movie.episodes.length > 0) {
      navigate(`/movie/${movie.episodes[0]._id}`); 
    } else {
      navigate(`/movie/${id}`);
    }
  };

  // Seasons and filtering calculations
  const uniqueSeasons = useMemo(() => {
    if (!movie || !movie.episodes) return [];
    const seasons = movie.episodes.map(ep => ep.seasonNumber).filter(s => s !== null && s !== undefined);
    return Array.from(new Set(seasons)).sort((a, b) => a - b);
  }, [movie]);

  const filteredEpisodes = useMemo(() => {
    if (!movie || !movie.episodes) return [];
    return movie.episodes.filter(ep => {
      const matchesSeason = ep.seasonNumber === selectedSeason;
      const matchesSearch = 
        ep.episodeTitle?.toLowerCase().includes(episodeSearchQuery.toLowerCase()) || 
        ep.episodeOverview?.toLowerCase().includes(episodeSearchQuery.toLowerCase()) ||
        String(ep.episodeNumber).includes(episodeSearchQuery);
      return matchesSeason && matchesSearch;
    });
  }, [movie, selectedSeason, episodeSearchQuery]);

  // 3D perspective scroll effect for episodes list
  const applyEpisodeDepth = useCallback(() => {
    const container = episodesListRef.current;
    if (!container) return;
    const cards = container.querySelectorAll('.episode-card-premium');
    const containerRect = container.getBoundingClientRect();
    // Center of the scrollable container
    const containerCenter = containerRect.top + containerRect.height / 2;

    cards.forEach(card => {
      const cardRect = card.getBoundingClientRect();
      const cardCenter = cardRect.top + cardRect.height / 2;
      
      // Distance relative to container height (-1 to 1)
      const distance = (cardCenter - containerCenter) / (containerRect.height / 2);
      const absDistance = Math.min(Math.abs(distance), 1.2);

      // Smooth scaling and depth
      const scale = 1 - absDistance * 0.2;
      const translateZ = -absDistance * 100;
      
      // Overlap cards smoothly (slide behind effect)
      // Negative multiplier pulls them towards the center
      const translateY = distance * -35; 
      
      card.style.transform = `perspective(1000px) translateZ(${translateZ}px) scale(${scale}) translateY(${translateY}px)`;
      card.style.opacity = '1'; // Keep all cards equally bright
      
      // Ensure the focused center card is on top
      const zIndex = Math.round((2 - absDistance) * 10);
      card.style.zIndex = zIndex.toString();
      
      card.style.pointerEvents = 'auto';
      
      // Focus indicator logic
      if (absDistance < 0.25) {
        card.classList.add('focused-card');
      } else {
        card.classList.remove('focused-card');
      }
    });
  }, []);

  useEffect(() => {
    if (!showEpisodes) return;
    // Apply once after render
    const timer = setTimeout(applyEpisodeDepth, 50);
    const container = episodesListRef.current?.closest('.episodes-drawer-content');
    if (container) {
      container.addEventListener('scroll', applyEpisodeDepth, { passive: true });
    }
    return () => {
      clearTimeout(timer);
      if (container) {
        container.removeEventListener('scroll', applyEpisodeDepth);
      }
    };
  }, [showEpisodes, applyEpisodeDepth, filteredEpisodes]);

  // Pause video when drawer opens, resume when closes
  useEffect(() => {
    if (videoRef.current) {
      if (showEpisodes) {
        videoRef.current.pause();
      } else {
        // Only resume if it was playing, but since we want to resume, we can just call play()
        // It's safer to only play if we know the user didn't pause it before opening.
        // Actually, let's just blindly play() based on the user's request: "when i close it it shoude resume"
        videoRef.current.play().catch(e => console.log('Autoplay prevented:', e));
      }
    }
  }, [showEpisodes]);

  if (loading) {
    return (
      <div className="player-page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#000' }}>
        <div className="loader-spinner" />
      </div>
    );
  }

  const isMpegTS = movie?.mimeType === 'video/mp2t' && !isIOS;
  const hasEpisodes = movie?.type === 'tv' && movie.episodes && movie.episodes.length > 1;

  return (
    <div 
      className="custom-player-container" 
      ref={containerRef}
    >
      <video
        ref={videoRef}
        src={isMpegTS ? undefined : videoSrc}
        autoPlay
        playsInline
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onClick={handleVideoClick}
        onTouchEnd={handleVideoTouch}
        onSeeked={handleSeeked}
        className="custom-player-video"
        style={{ cursor: showControls ? 'default' : 'none' }}
      >
        {movie?.subtitles?.map((sub, i) => (
          <track
            key={sub._id}
            kind="subtitles"
            src={getStreamUrl(sub._id)}
            srcLang="en"
            label={`English ${i + 1}`}
            default={i === 0}
          />
        ))}
      </video>

      {/* Central Pop Gesture Overlay */}
      <AnimatePresence>
        {gesture.active && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1.1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="player-gesture-indicator active"
          >
            {gesture.type === 'play' && <Play size={36} fill="white" />}
            {gesture.type === 'pause' && <Pause size={36} fill="white" />}
            {gesture.type === 'forward' && <RotateCw size={36} />}
            {gesture.type === 'backward' && <RotateCcw size={36} />}
            {gesture.type === 'sync' && <RefreshCw size={36} className="animate-spin" />}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Volume Scroll HUD */}
      <AnimatePresence>
        {volumeHud.visible && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="player-volume-hud"
          >
            {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
            <div className="player-volume-hud-bar">
              <div 
                className="player-volume-hud-fill" 
                style={{ width: `${isMuted ? 0 : volume * 100}%` }} 
              />
            </div>
            <span className="player-volume-hud-text">
              {Math.round((isMuted ? 0 : volume) * 100)}%
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Glassmorphic Controls Panel */}
      <AnimatePresence>
        {showControls && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="player-controls-overlay"
            onClick={handleVideoClick}
            onTouchEnd={handleVideoTouch}
          >
            {/* Top Bar */}
            <div className="player-top-bar" onClick={(e) => e.stopPropagation()}>
              <button onClick={handleBack} className="player-back-btn">
                <ArrowLeft size={18} /> Back
              </button>
              <div className="player-title-info">
                <h2>{movie.title}</h2>
                {movie.type === 'tv' && (
                  <p>S{movie.seasonNumber} E{movie.episodeNumber} - {movie.episodeTitle}</p>
                )}
              </div>
            </div>

            {/* Bottom-Left Info Overlay (Fades out with controls) */}
            <div className="player-info-overlay" onClick={(e) => e.stopPropagation()}>
              <div className="player-info-logo">{movie.title}</div>
              <div className="player-info-meta">
                {movie.type === 'tv' ? (
                  <>
                    <span>Season {movie.seasonNumber}</span>
                    <span>•</span>
                    <span>Episode {movie.episodeNumber}</span>
                    {movie.runtime && (
                      <>
                        <span>•</span>
                        <span>{movie.runtime}m</span>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    {movie.releaseYear && <span>{movie.releaseYear}</span>}
                    {movie.releaseYear && movie.runtime && <span>•</span>}
                    {movie.runtime && <span>{movie.runtime}m</span>}
                  </>
                )}
              </div>
              <h1 className="player-info-title">
                {movie.type === 'tv' ? movie.episodeTitle : movie.title}
              </h1>
              <p className="player-info-desc">
                {movie.type === 'tv' ? movie.episodeOverview : movie.overview}
              </p>
            </div>

            {/* Bottom Panel */}
            <div className="player-bottom-bar" onClick={(e) => e.stopPropagation()}>
              {/* Custom Timeline Scrubber */}
              <div 
                className="player-scrubber-container"
                ref={scrubberRef}
                onMouseDown={handleScrubberMouseDown}
                onMouseMove={handleScrubberMouseMove}
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
              >
                <div className="player-scrubber-rail">
                  <div 
                    className="player-scrubber-progress" 
                    style={{ width: `${progress}%` }} 
                  />
                  <div 
                    className="player-scrubber-handle" 
                    style={{ left: `${progress}%` }}
                  />
                </div>
                
                {showTooltip && (
                  <div 
                    className="player-scrubber-tooltip"
                    style={{ left: `${tooltipLeft}px` }}
                  >
                    {tooltipTime}
                  </div>
                )}
              </div>

              {/* Controls Controls Row */}
              <div className="player-controls-row">
                <div className="player-controls-left">
                  {/* Play / Pause */}
                  <button onClick={() => togglePlay(false)} className="player-ctrl-btn" title={isPlaying ? "Pause" : "Play"}>
                    {isPlaying ? <Pause size={24} fill="white" /> : <Play size={24} fill="white" />}
                  </button>

                  {/* Seek Back 10s */}
                  <button onClick={() => seekRelative(-10)} className="player-ctrl-btn" title="Rewind 10s">
                    <RotateCcw size={22} />
                  </button>

                  {/* Seek Forward 10s */}
                  <button onClick={() => seekRelative(10)} className="player-ctrl-btn" title="Fast Forward 10s">
                    <RotateCw size={22} />
                  </button>

                  {/* Volume Controller */}
                  <div className="player-volume-wrapper">
                    <button onClick={toggleMute} className="player-ctrl-btn" title={isMuted ? "Unmute" : "Mute"}>
                      {isMuted || volume === 0 ? <VolumeX size={22} /> : <Volume2 size={22} />}
                    </button>
                    <div 
                      className={`player-volume-bar-container ${(isDraggingVolume || showControls) ? 'active' : ''}`}
                      ref={volumeRailRef}
                      onMouseDown={handleVolumeMouseDown}
                    >
                      <div className="player-volume-rail">
                        <div 
                          className="player-volume-fill" 
                          style={{ width: `${isMuted ? 0 : volume * 100}%` }} 
                        />
                        <div 
                          className="player-volume-handle" 
                          style={{ left: `${isMuted ? 0 : volume * 100}%` }} 
                        />
                      </div>
                    </div>
                  </div>

                  {/* Time display */}
                  <span className="player-time-display">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>

                <div className="player-controls-right">
                  {/* Playback speed selector */}
                  <div className="player-speed-wrapper">
                    <button 
                      onClick={() => setShowSpeedMenu(!showSpeedMenu)} 
                      className="player-ctrl-btn"
                      title="Playback Speed"
                      style={{ fontSize: '0.9rem', fontWeight: '600', padding: '4px 8px' }}
                    >
                      {playbackSpeed}x
                    </button>
                    <AnimatePresence>
                      {showSpeedMenu && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="player-speed-menu"
                        >
                          {[0.5, 1, 1.25, 1.5, 2].map(speed => (
                            <button
                              key={speed}
                              onClick={() => changeSpeed(speed)}
                              className={`player-speed-option ${playbackSpeed === speed ? 'active' : ''}`}
                            >
                              {speed}x
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>



                  {/* TV Episodes list sidebar */}
                  {hasEpisodes && (
                    <button 
                      onClick={() => setShowEpisodes(!showEpisodes)} 
                      className="player-ctrl-btn"
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem' }}
                      title="Episodes list"
                    >
                      <List size={20} /> Episodes
                    </button>
                  )}

                  {/* Sync Audio */}
                  <button onClick={resyncAudio} className="player-ctrl-btn" title="Sync Audio/Video">
                    <RefreshCw size={20} />
                  </button>

                  {/* Fullscreen toggle */}
                  <button onClick={toggleFullscreen} className="player-ctrl-btn" title="Fullscreen">
                    {isFullscreen ? <Minimize size={22} /> : <Maximize size={22} />}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Episodes Sidebar Drawer */}
      <AnimatePresence>
        {showEpisodes && hasEpisodes && (
          <motion.div 
            initial={{ x: '100%' }} 
            animate={{ x: 0 }} 
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.3 }}
            className="episodes-drawer-container"
          >
            {/* Drawer Header */}
            <div className="episodes-drawer-header">
              {/* Search wrap */}
              <div className="drawer-search-wrap">
                <Search size={14} className="drawer-search-icon" />
                <input 
                  type="text" 
                  placeholder="Search episodes" 
                  value={episodeSearchQuery}
                  onChange={(e) => setEpisodeSearchQuery(e.target.value)}
                  className="drawer-search-input"
                />
              </div>

              {/* Season select dropdown */}
              {uniqueSeasons.length > 1 && (
                <select 
                  value={selectedSeason} 
                  onChange={(e) => setSelectedSeason(Number(e.target.value))}
                  className="drawer-season-select"
                >
                  {uniqueSeasons.map(s => (
                    <option key={s} value={s}>S{s}</option>
                  ))}
                </select>
              )}

              {/* Auto next toggle switch */}
              <div className="drawer-autonext-wrap">
                <span>Auto next</span>
                <label className="autonext-switch">
                  <input 
                    type="checkbox" 
                    checked={autoNext} 
                    onChange={(e) => setAutoNext(e.target.checked)}
                  />
                  <span className="autonext-slider">
                    <span className="autonext-label-text">{autoNext ? 'ON' : 'OFF'}</span>
                  </span>
                </label>
              </div>

              {/* Close Button */}
              <button onClick={() => setShowEpisodes(false)} className="drawer-close-btn">
                <X size={18} />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="episodes-drawer-content">
              {/* Season Info */}
              <div className="drawer-season-info">
                <h3 className="drawer-season-title">Season {selectedSeason}</h3>
                {movie.overview && (
                  <p className="drawer-season-desc">{movie.overview}</p>
                )}
              </div>

              {/* Episode list */}
              <div className="drawer-episodes-list" ref={episodesListRef}>
                {filteredEpisodes.map((ep, idx) => {
                  const isActive = ep._id === id;
                  return (
                    <div 
                      key={ep._id}
                      onClick={() => {
                        if (!isActive) {
                          setShowEpisodes(false);
                          navigate(`/play/${ep._id}`);
                        }
                      }}
                      className={`episode-card-premium ${isActive ? 'active' : 'inactive'}`}
                      data-index={idx}
                    >
                      {/* Background Backdrop Image */}
                      {ep.episodeStillPath ? (
                        <img 
                          src={ep.episodeStillPath} 
                          alt="" 
                          className="episode-card-bg-image" 
                        />
                      ) : movie.backdropPath ? (
                        <img 
                          src={movie.backdropPath} 
                          alt="" 
                          className="episode-card-bg-image" 
                        />
                      ) : (
                        <div className="episode-card-no-image" />
                      )}

                      {/* Dark overlay gradient */}
                      <div className="episode-card-overlay" />

                      {/* Play button indicator (shown on focused card) */}
                      <div className="episode-card-play-indicator">
                        <svg viewBox="0 0 24 24" fill="white" width="18" height="18">
                          <polygon points="8 5 19 12 8 19 8 5" />
                        </svg>
                      </div>

                      {/* Card content */}
                      <div className="episode-card-meta-wrap">
                        {isActive && (
                          <span className="watching-badge">WATCHING</span>
                        )}
                        <h4 className="episode-card-title">
                          {ep.episodeNumber}. {ep.episodeTitle || 'Episode'}
                        </h4>
                        <span className="episode-card-runtime">
                          {ep.runtime ? `${ep.runtime}m left` : ''}
                        </span>
                        {isActive && ep.episodeOverview && (
                          <p className="episode-card-desc">
                            {ep.episodeOverview.length > 100 
                              ? `${ep.episodeOverview.slice(0, 100)}...` 
                              : ep.episodeOverview}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
                {filteredEpisodes.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#666', padding: '2rem 0', fontStyle: 'italic' }}>
                    No episodes found.
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Next Episode Countdown Popup */}
      <AnimatePresence>
        {countdownActive && nextMedia && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            className="next-episode-countdown-card"
          >
            <div className="countdown-header">Next episode starting in</div>
            
            <div className="countdown-body">
              <div className="countdown-thumb">
                {nextMedia.episodeStillPath ? (
                  <img src={nextMedia.episodeStillPath} alt="" />
                ) : movie.posterPath ? (
                  <img src={movie.posterPath} alt="" />
                ) : (
                  <div style={{ width: '100%', height: '100%', background: '#222' }} />
                )}
                
                <div className="countdown-ring-overlay">
                  <svg className="countdown-ring-svg" width="36" height="36">
                    <circle className="countdown-ring-circle-bg" cx="18" cy="18" r="14" />
                    <circle 
                      className="countdown-ring-circle" 
                      cx="18" 
                      cy="18" 
                      r="14"
                      strokeDasharray="88"
                      strokeDashoffset={88 - (88 * (10 - countdownSeconds)) / 10}
                    />
                  </svg>
                  <span className="countdown-text-inside">{countdownSeconds}</span>
                </div>
              </div>

              <div className="countdown-info">
                <h4 className="countdown-title">
                  {nextMedia.episodeNumber ? `${nextMedia.episodeNumber}. ` : ''}
                  {nextMedia.episodeTitle || nextMedia.title || 'Next Episode'}
                </h4>
                {nextMedia.seasonNumber && (
                  <span className="countdown-meta">
                    Season {nextMedia.seasonNumber} • Episode {nextMedia.episodeNumber}
                  </span>
                )}
              </div>
            </div>

            <div className="countdown-actions">
              <button onClick={playNextEpisode} className="countdown-btn-play">
                <Play size={14} fill="black" /> Play Now
              </button>
              <button onClick={cancelCountdown} className="countdown-btn-cancel">
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Keyboard Shortcuts Modal */}
      <AnimatePresence>
        {showShortcuts && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="shortcuts-modal-overlay"
            onClick={() => setShowShortcuts(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="shortcuts-modal-card"
              onClick={e => e.stopPropagation()}
            >
              <div className="shortcuts-modal-header">
                <h3 className="shortcuts-modal-title">Keyboard Shortcuts</h3>
                <button onClick={() => setShowShortcuts(false)} className="drawer-close-btn">
                  <X size={18} />
                </button>
              </div>
              
              <div className="shortcuts-list">
                <div className="shortcut-row">
                  <span className="shortcut-label">Play / Pause</span>
                  <div className="shortcut-keys">
                    <span className="shortcut-keycap">Space</span>
                    <span>or</span>
                    <span className="shortcut-keycap">K</span>
                  </div>
                </div>
                <div className="shortcut-row">
                  <span className="shortcut-label">Seek Backward 10s</span>
                  <div className="shortcut-keys">
                    <span className="shortcut-keycap">←</span>
                  </div>
                </div>
                <div className="shortcut-row">
                  <span className="shortcut-label">Seek Forward 10s</span>
                  <div className="shortcut-keys">
                    <span className="shortcut-keycap">→</span>
                  </div>
                </div>
                <div className="shortcut-row">
                  <span className="shortcut-label">Volume Up / Down</span>
                  <div className="shortcut-keys">
                    <span className="shortcut-keycap">↑</span>
                    <span className="shortcut-keycap">↓</span>
                  </div>
                </div>
                <div className="shortcut-row">
                  <span className="shortcut-label">Toggle Fullscreen</span>
                  <div className="shortcut-keys">
                    <span className="shortcut-keycap">F</span>
                  </div>
                </div>
                <div className="shortcut-row">
                  <span className="shortcut-label">Toggle Mute</span>
                  <div className="shortcut-keys">
                    <span className="shortcut-keycap">M</span>
                  </div>
                </div>
                <div className="shortcut-row">
                  <span className="shortcut-label">Open / Close Help</span>
                  <div className="shortcut-keys">
                    <span className="shortcut-keycap">?</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
