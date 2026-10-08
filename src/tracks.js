import { ref, watch } from 'vue'

const STORAGE_KEY = 'rpg-music:tracks'

/** Extrai o ID de 11 caracteres de qualquer formato de link do YouTube. */
export function parseVideoId(input) {
  const text = String(input || '').trim()
  if (/^[\w-]{11}$/.test(text)) return text
  try {
    const url = new URL(text.startsWith('http') ? text : `https://${text}`)
    const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '')
    if (host === 'youtu.be') return valid(url.pathname.slice(1))
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (url.searchParams.get('v')) return valid(url.searchParams.get('v'))
      const m = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/)
      if (m) return m[1]
    }
  } catch {
    // não é URL
  }
  return null
}

function valid(id) {
  const clean = (id || '').slice(0, 11)
  return /^[\w-]{11}$/.test(clean) ? clean : null
}

/** Busca o título do vídeo sem precisar de chave de API. */
export async function fetchTitle(videoId) {
  const watchUrl = encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)
  const sources = [
    `https://www.youtube.com/oembed?format=json&url=${watchUrl}`,
    `https://noembed.com/embed?url=${watchUrl}`,
  ]
  for (const src of sources) {
    try {
      const res = await fetch(src)
      if (!res.ok) continue
      const data = await res.json()
      if (data.title) return data.title
    } catch {
      // tenta a próxima fonte
    }
  }
  return null
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(data) ? data.filter((t) => t && t.videoId) : []
  } catch {
    return []
  }
}

export const tracks = ref(load())

watch(
  tracks,
  (value) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    } catch {
      // armazenamento indisponível
    }
  },
  { deep: true },
)

export function addTrack(videoId, name) {
  const track = { id: newId(), videoId, name, autoName: !name }
  tracks.value.push(track)
  return tracks.value[tracks.value.length - 1]
}

export function removeTrack(id) {
  tracks.value = tracks.value.filter((t) => t.id !== id)
}

export function moveTrack(id, delta) {
  const list = tracks.value
  const i = list.findIndex((t) => t.id === id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= list.length) return
  ;[list[i], list[j]] = [list[j], list[i]]
}

export function exportJson() {
  return JSON.stringify(
    {
      app: 'rpg-music',
      version: 1,
      tracks: tracks.value.map(({ videoId, name }) => ({ videoId, name })),
    },
    null,
    2,
  )
}

/** Lê o JSON exportado. Aceita {tracks:[...]} ou uma lista direta. */
export function parseImport(text) {
  const data = JSON.parse(text)
  const list = Array.isArray(data) ? data : data?.tracks
  if (!Array.isArray(list)) throw new Error('Formato inválido')
  const result = []
  for (const item of list) {
    const videoId = parseVideoId(item?.videoId || item?.url || item)
    if (!videoId) continue
    result.push({ id: newId(), videoId, name: String(item?.name || videoId) })
  }
  if (!result.length) throw new Error('Nenhuma música encontrada no JSON')
  return result
}

export function importTracks(list, mode) {
  if (mode === 'replace') {
    tracks.value = list
    return
  }
  const existing = new Set(tracks.value.map((t) => t.videoId))
  for (const t of list) if (!existing.has(t.videoId)) tracks.value.push(t)
}
