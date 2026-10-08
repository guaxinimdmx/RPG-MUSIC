import { ref } from 'vue'

/** true quando o Chrome permite oferecer a instalação do app. */
export const canInstall = ref(false)
let deferredPrompt = null

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferredPrompt = e
  canInstall.value = true
})

window.addEventListener('appinstalled', () => {
  deferredPrompt = null
  canInstall.value = false
})

export async function install() {
  if (!deferredPrompt) return
  deferredPrompt.prompt()
  await deferredPrompt.userChoice
  deferredPrompt = null
  canInstall.value = false
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}))
}
