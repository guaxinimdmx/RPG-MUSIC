import { ref } from 'vue'

const FADE_OUT_MS = 1500
const FADE_IN_MS = 1500
const MAX_VOLUME = 100

/** ID da música selecionada (tocando ou pausada). */
export const currentId = ref(null)
/** 'idle' | 'loading' | 'playing' | 'paused' */
export const status = ref('idle')
export const ready = ref(false)
export const errorMessage = ref('')

let player = null
// Música realmente carregada no player do YouTube.
let loadedTrackId = null
// Cada ação nova incrementa o token e cancela fades/esperas da ação anterior.
let opToken = 0
let playingWaiters = []
// Posição de cada música na sessão atual, para retomar de onde parou ao voltar nela.
const positions = new Map()

function loadApi() {
  return new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT)
    window.onYouTubeIframeAPIReady = () => resolve(window.YT)
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(script)
  })
}

export async function initPlayer(elementId) {
  const YT = await loadApi()
  player = new YT.Player(elementId, {
    width: 200,
    height: 200,
    playerVars: {
      autoplay: 0,
      controls: 0,
      disablekb: 1,
      fs: 0,
      playsinline: 1,
      rel: 0,
      iv_load_policy: 3,
    },
    events: {
      onReady: () => {
        ready.value = true
      },
      onStateChange: onStateChange,
      onError: onError,
    },
  })
}

function onStateChange(e) {
  const S = window.YT.PlayerState
  if (e.data === S.PLAYING) {
    const waiters = playingWaiters
    playingWaiters = []
    waiters.forEach((resolve) => resolve(true))
  } else if (e.data === S.ENDED) {
    // loop
    player.seekTo(0, true)
    player.playVideo()
  }
}

function onError(e) {
  const messages = {
    2: 'Link inválido.',
    5: 'Erro do player HTML5.',
    100: 'Vídeo não encontrado ou privado.',
    101: 'O dono do vídeo não permite tocar fora do YouTube.',
    150: 'O dono do vídeo não permite tocar fora do YouTube.',
  }
  errorMessage.value = messages[e.data] || `Erro do YouTube (${e.data}).`
  opToken++
  status.value = 'idle'
  currentId.value = null
  loadedTrackId = null
  releaseWakeLock()
}

function waitForPlaying(token, timeout = 15000) {
  return new Promise((resolve) => {
    if (player.getPlayerState() === window.YT.PlayerState.PLAYING) return resolve(true)
    playingWaiters.push(resolve)
    setTimeout(() => resolve(false), timeout)
  }).then((ok) => ok && token === opToken)
}

function fadeTo(target, ms, token) {
  return new Promise((resolve) => {
    const from = player.getVolume()
    const steps = Math.max(1, Math.round(ms / 50))
    let i = 0
    const timer = setInterval(() => {
      if (token !== opToken) {
        clearInterval(timer)
        return resolve(false)
      }
      i++
      player.setVolume(Math.round(from + ((target - from) * i) / steps))
      if (i >= steps) {
        clearInterval(timer)
        resolve(true)
      }
    }, ms / steps)
  })
}

async function fadeOutAndPause(token) {
  const done = await fadeTo(0, FADE_OUT_MS, token)
  if (!done) return false
  player.pauseVideo()
  return true
}

async function playWithFadeIn(token) {
  player.setVolume(0)
  player.playVideo()
  if (!(await waitForPlaying(token))) return
  status.value = 'playing'
  await fadeTo(MAX_VOLUME, FADE_IN_MS, token)
}

/** Toque na música: toca, pausa ou troca (com fade). */
export async function toggle(track) {
  if (!ready.value) return
  errorMessage.value = ''
  const token = ++opToken

  // Mesma música: alterna entre pausar e continuar.
  if (currentId.value === track.id && loadedTrackId === track.id) {
    if (status.value === 'playing' || status.value === 'loading') {
      status.value = 'paused'
      releaseWakeLock()
      await fadeOutAndPause(token)
    } else {
      status.value = 'loading'
      requestWakeLock()
      await playWithFadeIn(token)
    }
    return
  }

  // Outra música: some com a anterior e entra com a nova.
  const wasPlaying = status.value === 'playing' || status.value === 'loading'
  if (loadedTrackId) positions.set(loadedTrackId, player.getCurrentTime())
  currentId.value = track.id
  status.value = 'loading'
  requestWakeLock()

  if (wasPlaying && !(await fadeOutAndPause(token))) return
  if (token !== opToken) return

  loadedTrackId = track.id
  player.setVolume(0)
  player.loadVideoById({ videoId: track.videoId, startSeconds: positions.get(track.id) || 0 })
  if (!(await waitForPlaying(token))) return
  status.value = 'playing'
  await fadeTo(MAX_VOLUME, FADE_IN_MS, token)
}

/** Botão de stop: para tudo com fade. Tocar na música de novo continua de onde parou. */
export async function stopAll() {
  if (!ready.value || !currentId.value) return
  if (status.value !== 'playing' && status.value !== 'loading') return
  const token = ++opToken
  status.value = 'paused'
  releaseWakeLock()
  await fadeOutAndPause(token)
}

/** Chamado quando a música selecionada é apagada da lista. */
export function forget(trackId) {
  positions.delete(trackId)
  if (currentId.value !== trackId && loadedTrackId !== trackId) return
  opToken++
  player?.stopVideo()
  currentId.value = null
  loadedTrackId = null
  status.value = 'idle'
  releaseWakeLock()
}

// Mantém a tela acesa enquanto a música toca (o navegador costuma pausar o
// YouTube quando a tela apaga).
let wakeLock = null

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen')
      wakeLock.addEventListener('release', () => {
        wakeLock = null
      })
    }
  } catch {
    // sem suporte ou negado
  }
}

function releaseWakeLock() {
  wakeLock?.release().catch(() => {})
  wakeLock = null
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && status.value === 'playing') requestWakeLock()
})
