<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import {
  tracks,
  parseVideoId,
  fetchTitle,
  addTrack,
  removeTrack,
  moveTrack,
  exportJson,
  parseImport,
  importTracks,
} from './tracks.js'
import {
  initPlayer,
  toggle,
  stopAll,
  forget,
  cancelTap,
  currentId,
  status,
  ready,
  errorMessage,
  needsTap,
} from './player.js'
import { canInstall, install } from './install.js'

const link = ref('')
const adding = ref(false)
const toast = ref('')
const menuTrack = ref(null)
const dialog = ref(null) // null | 'import' | 'export'
const dialogText = ref('')

const isActive = computed(() => status.value === 'playing' || status.value === 'loading')

onMounted(() => initPlayer('yt-player'))

// Quando o aviso de "toque no vídeo" aparece, encaixa o player no espaço reservado.
const tapSlot = ref(null)
const ytBoxStyle = ref({})
watch(needsTap, async (show) => {
  if (!show) return (ytBoxStyle.value = {})
  await nextTick()
  const r = tapSlot.value?.getBoundingClientRect()
  if (r) ytBoxStyle.value = { top: `${r.top}px`, left: `${r.left}px`, margin: 0 }
})

let toastTimer
function notify(message) {
  toast.value = message
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 2500)
}

async function onAdd() {
  const videoId = parseVideoId(link.value)
  if (!videoId) return notify('Link do YouTube inválido')
  if (tracks.value.some((t) => t.videoId === videoId) && !confirm('Essa música já está na lista. Adicionar de novo?'))
    return
  adding.value = true
  const track = addTrack(videoId, null)
  track.name = 'Carregando nome…'
  link.value = ''
  const title = await fetchTitle(videoId)
  // só preenche se o usuário não renomeou enquanto carregava
  if (track.autoName) track.name = title || `Música ${tracks.value.length}`
  delete track.autoName
  adding.value = false
}

async function pasteLink() {
  try {
    link.value = await navigator.clipboard.readText()
  } catch {
    notify('Não consegui ler a área de transferência')
  }
}

function stateOf(track) {
  if (currentId.value !== track.id) return 'idle'
  return status.value
}

function rename(track) {
  const name = prompt('Nome da música', track.name)
  if (name && name.trim()) {
    track.name = name.trim()
    delete track.autoName
  }
  menuTrack.value = null
}

function remove(track) {
  if (!confirm(`Remover "${track.name}"?`)) return
  forget(track.id)
  removeTrack(track.id)
  menuTrack.value = null
}

function move(track, delta) {
  moveTrack(track.id, delta)
}

async function onExport() {
  const json = exportJson()
  try {
    await navigator.clipboard.writeText(json)
    notify(`${tracks.value.length} músicas copiadas!`)
  } catch {
    // sem permissão: mostra o texto para copiar na mão
    dialogText.value = json
    dialog.value = 'export'
  }
}

async function openImport() {
  dialogText.value = ''
  dialog.value = 'import'
  try {
    const text = await navigator.clipboard.readText()
    if (text.trim().startsWith('{') || text.trim().startsWith('[')) dialogText.value = text
  } catch {
    // usuário cola manualmente
  }
}

function doImport(mode) {
  try {
    const list = parseImport(dialogText.value)
    if (mode === 'replace' && tracks.value.length && !confirm('Substituir toda a lista atual?')) return
    if (mode === 'replace') tracks.value.forEach((t) => forget(t.id))
    importTracks(list, mode)
    dialog.value = null
    notify(`${list.length} músicas importadas`)
  } catch (e) {
    notify(e.message || 'JSON inválido')
  }
}
</script>

<template>
  <div class="app">
    <header class="top">
      <h1>🎲 RPG Music</h1>
      <div class="top-actions">
        <button class="ghost" @click="onExport" :disabled="!tracks.length">Exportar</button>
        <button class="ghost" @click="openImport">Importar</button>
      </div>
    </header>

    <button v-if="canInstall" class="install" @click="install">📲 Instalar app no celular</button>

    <form class="add" @submit.prevent="onAdd">
      <input
        v-model="link"
        type="url"
        inputmode="url"
        placeholder="Cole o link do YouTube"
        autocomplete="off"
      />
      <button v-if="!link" type="button" class="ghost" @click="pasteLink">Colar</button>
      <button v-else type="submit" class="primary" :disabled="adding">Adicionar</button>
    </form>

    <p v-if="!ready" class="hint">Carregando player do YouTube…</p>
    <p v-if="errorMessage" class="error">{{ errorMessage }}</p>

    <ul class="list">
      <li v-for="(track, i) in tracks" :key="track.id" :class="['track', stateOf(track)]">
        <button class="play" @click="toggle(track)" :disabled="!ready">
          <span class="icon">
            <template v-if="stateOf(track) === 'playing'">❚❚</template>
            <span v-else-if="stateOf(track) === 'loading'" class="spinner"></span>
            <template v-else>▶</template>
          </span>
          <span class="name">{{ track.name }}</span>
          <span v-if="stateOf(track) === 'playing'" class="eq"><i></i><i></i><i></i></span>
          <span v-else-if="stateOf(track) === 'paused'" class="tag">pausada</span>
        </button>
        <button class="more" @click="menuTrack = track" aria-label="Opções">⋯</button>
      </li>
    </ul>

    <p v-if="!tracks.length" class="empty">
      Nenhuma música ainda.<br />Cole um link do YouTube acima para começar.
    </p>

    <div class="bottom">
      <button class="stop" @click="stopAll" :disabled="!isActive">■ Parar tudo</button>
    </div>

    <!-- menu da música -->
    <div v-if="menuTrack" class="overlay" @click.self="menuTrack = null">
      <div class="sheet">
        <p class="sheet-title">{{ menuTrack.name }}</p>
        <button @click="rename(menuTrack)">✎ Renomear</button>
        <div class="row">
          <button @click="move(menuTrack, -1)" :disabled="tracks[0] === menuTrack">↑ Subir</button>
          <button @click="move(menuTrack, 1)" :disabled="tracks[tracks.length - 1] === menuTrack">↓ Descer</button>
        </div>
        <button class="danger" @click="remove(menuTrack)">🗑 Remover</button>
        <button class="ghost" @click="menuTrack = null">Fechar</button>
      </div>
    </div>

    <!-- importar / exportar -->
    <div v-if="dialog" class="overlay" @click.self="dialog = null">
      <div class="sheet">
        <template v-if="dialog === 'import'">
          <p class="sheet-title">Importar músicas</p>
          <textarea v-model="dialogText" placeholder="Cole aqui o JSON exportado"></textarea>
          <div class="row">
            <button @click="doImport('merge')" :disabled="!dialogText.trim()">Adicionar à lista</button>
            <button class="primary" @click="doImport('replace')" :disabled="!dialogText.trim()">Substituir lista</button>
          </div>
        </template>
        <template v-else>
          <p class="sheet-title">Copie o texto abaixo</p>
          <textarea readonly :value="dialogText" @focus="$event.target.select()"></textarea>
        </template>
        <button class="ghost" @click="dialog = null">Fechar</button>
      </div>
    </div>

    <div v-if="toast" class="toast">{{ toast }}</div>

    <!-- Android às vezes bloqueia o play: aí o player aparece para um toque nele -->
    <div v-if="needsTap" class="overlay tap-overlay">
      <div class="tap-card">
        <p class="sheet-title">Toque no ▶ do vídeo para liberar o som</p>
        <p class="tap-hint">O celular pede isso uma vez. Depois as músicas tocam direto.</p>
        <div ref="tapSlot" class="tap-slot"></div>
        <button class="ghost" @click="cancelTap">Cancelar</button>
      </div>
    </div>

    <!-- Player invisível (mas dentro da tela, senão o Chrome do Android o congela).
         Nunca mover este elemento no DOM: o iframe recarregaria. -->
    <div :class="['yt-box', { visible: needsTap }]" :style="ytBoxStyle" aria-hidden="true"><div id="yt-player"></div></div>
  </div>
</template>
