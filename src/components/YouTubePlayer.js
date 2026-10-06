// The film, played from YouTube. The page drives it (seek, pause) and hears back the
// playhead, which the IFrame API only gives when asked, so it is polled while playing.
import { onMounted, onBeforeUnmount, ref } from 'vue';

let api = null;
function loadApi() {
  if (!api) {
    api = new Promise((resolve, reject) => {
      if (window.YT?.Player) { resolve(window.YT); return; }
      const earlier = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { earlier?.(); resolve(window.YT); };
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.onerror = () => { api = null; reject(new Error('YouTube player did not load')); };
      document.head.append(script);
    });
  }
  return api;
}

const ERRORS = {
  2: 'YouTube did not recognise this video.',
  5: 'This video cannot play in the embedded player.',
  100: 'This video is no longer on YouTube.',
  101: 'The uploader does not allow this video to play here.',
  150: 'The uploader does not allow this video to play here.',
};

export default {
  name: 'YouTubePlayer',
  props: {
    videoId: { type: String, required: true },
    start: { type: Number, default: 0 },
    watchUrl: { type: String, default: '' },
  },
  emits: ['time', 'state'],
  setup(props, { emit, expose }) {
    const mount = ref(null);
    const error = ref('');
    let player = null, ready = false, timer = null, pending = props.start, gone = false;

    const current = () => (ready ? player.getCurrentTime() : pending ?? 0);
    const report = () => emit('time', current());
    const poll = (on) => {
      clearInterval(timer); timer = null;
      if (on) timer = setInterval(report, 250);
    };

    function seek(seconds) {
      if (!ready) { pending = seconds; return; }
      player.seekTo(seconds, true);
      player.playVideo();
      emit('time', seconds);
    }
    function pause() { if (ready) player.pauseVideo(); }
    function toggle() {
      if (!ready) return;
      if (player.getPlayerState() === window.YT.PlayerState.PLAYING) player.pauseVideo(); else player.playVideo();
    }
    function nudge(delta) { if (ready) seek(Math.max(0, current() + delta)); }

    // Keys work while focus is on the page; inside the frame YouTube handles its own.
    function onKey(e) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, select, textarea, button, a, [role=dialog]')) return;
      if (e.key === ' ' || e.key === 'k') { e.preventDefault(); toggle(); }
      else if (e.key === 'j') nudge(-10);
      else if (e.key === 'l') nudge(10);
    }

    onMounted(async () => {
      window.addEventListener('keydown', onKey);
      let YT;
      try { YT = await loadApi(); } catch (e) { error.value = e.message; return; }
      if (gone) return;
      player = new YT.Player(mount.value, {
        videoId: props.videoId,
        host: 'https://www.youtube-nocookie.com',
        width: '100%',
        height: '100%',
        playerVars: { autoplay: 1, playsinline: 1, rel: 0, start: Math.floor(pending ?? 0), origin: location.origin },
        events: {
          onReady: () => {
            ready = true;
            // `start` is whole seconds; evidence moments are not.
            if (pending != null) { player.seekTo(pending, true); pending = null; }
            player.playVideo();
          },
          onStateChange: ({ data }) => {
            const playing = data === YT.PlayerState.PLAYING;
            poll(playing);
            report();
            emit('state', { playing, ended: data === YT.PlayerState.ENDED });
          },
          onError: ({ data }) => { error.value = ERRORS[data] ?? 'The video could not be played.'; },
        },
      });
    });

    onBeforeUnmount(() => {
      gone = true;
      poll(false);
      window.removeEventListener('keydown', onKey);
      player?.destroy?.();
    });

    expose({ seek, pause, toggle, current });
    return { mount, error };
  },
  template: `
    <div class="yt">
      <div ref="mount"></div>
      <p v-if="error" class="yt-error">{{ error }} <a v-if="watchUrl" :href="watchUrl" target="_blank" rel="noopener">Watch on YouTube ↗</a></p>
    </div>
  `,
};
