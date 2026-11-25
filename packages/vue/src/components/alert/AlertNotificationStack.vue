<!--
  警报通知：展示已投递到应用内渠道的通知。
-->
<template>
  <section v-if="visible.length > 0" class="alert-notification-stack" role="log" aria-live="polite">
    <article v-for="fire in visible" :key="fire.id" class="alert-card">
      <div class="alert-card__body">
        <span class="alert-card__head">
          <span class="alert-card__source">{{ fire.source.ticker }} · {{ fire.source.interval }}</span>
          <span class="alert-card__time">{{ formatTime(fire.firedAt) }}</span>
        </span>
        <span class="alert-card__message">{{ fire.message }}</span>
        <span class="alert-card__meta">{{ fire.price }}</span>
      </div>
      <BaseIconButton label="关闭通知" size="xs" @click="dismiss(fire.id)">
        <IconTablerX aria-hidden="true" />
      </BaseIconButton>
    </article>
  </section>
</template>

<script setup lang="ts">
  import type { AlertFire, AlertService } from '@363045841yyt/klinechart-core/controllers'
  import BaseIconButton from '@vue-src/components/common/button/BaseIconButton.vue'
  import { onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
  import IconTablerX from '~icons/tabler/x'

  /** 同时在屏的卡片上限；更早的由新卡片顶掉。 */
  const MAX_CARDS = 3
  /** 单张卡片的存活时间；悬停不暂停，避免通知堆积。 */
  const CARD_LIFETIME_MS = 8000

  const props = defineProps<{ alerts: AlertService }>()

  const visible = shallowRef<readonly AlertFire[]>([])
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  let audio: AudioContext | undefined

  function enableAudio(): void {
    if (typeof AudioContext === 'undefined') return
    audio ??= new AudioContext()
    if (audio.state === 'suspended') void audio.resume().catch(console.error)
  }

  function playSound(): void {
    if (audio?.state !== 'running') return
    const tone = audio.createOscillator()
    const volume = audio.createGain()
    const now = audio.currentTime
    tone.frequency.value = 660
    volume.gain.setValueAtTime(0.12, now)
    volume.gain.exponentialRampToValueAtTime(0.001, now + 0.18)
    tone.connect(volume).connect(audio.destination)
    tone.start(now)
    tone.stop(now + 0.18)
    tone.onended = () => {
      tone.disconnect()
      volume.disconnect()
    }
  }

  /** 移除一张卡片并清理它的计时器。 */
  function dismiss(id: string): void {
    const timer = timers.get(id)
    if (timer !== undefined) clearTimeout(timer)
    timers.delete(id)
    visible.value = visible.value.filter((fire) => fire.id !== id)
  }

  /** 新触发插到最前；超过上限时移除最旧的一张。 */
  function push(fire: AlertFire): void {
    visible.value = [fire, ...visible.value]
    while (visible.value.length > MAX_CARDS) {
      const oldest = visible.value[visible.value.length - 1]
      if (!oldest) break
      dismiss(oldest.id)
    }
    timers.set(
      fire.id,
      setTimeout(() => dismiss(fire.id), CARD_LIFETIME_MS),
    )
  }

  /** 只显示时分秒；完整日期在告警日志里。 */
  function formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString()
  }

  watch(() => props.alerts, (service, _previous, cleanup) => {
    const inApp = service.subscribeNotifications('in-app', push)
    const sound = service.subscribeNotifications('sound', playSound)
    cleanup(() => {
      inApp()
      sound()
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
      visible.value = []
    })
  }, { immediate: true })

  onMounted(() => {
    window.addEventListener('pointerdown', enableAudio, { once: true })
    window.addEventListener('keydown', enableAudio, { once: true })
  })

  onBeforeUnmount(() => {
    window.removeEventListener('pointerdown', enableAudio)
    window.removeEventListener('keydown', enableAudio)
    if (audio) void audio.close().catch(console.error)
  })
</script>

<style scoped>
  .alert-notification-stack {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 40;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: min(360px, calc(100vw - 32px));
    pointer-events: none;
  }

  .alert-card {
    display: flex;
    align-items: flex-start;
    gap: 4px;
    padding: 10px 12px;
    border: 1px solid var(--klc-color-ui-border, rgba(127, 127, 127, 0.3));
    border-radius: var(--klc-radius-lg, 10px);
    background: var(--klc-color-ui-surface);
    color: var(--klc-color-ui-text);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    pointer-events: auto;
  }

  .alert-card__body {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
  }

  .alert-card__head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 0.75rem;
    color: var(--klc-color-ui-text-soft);
  }

  .alert-card__message {
    font-size: 0.875rem;
    font-weight: 600;
    line-height: 1.35;
  }

  .alert-card__meta {
    font-size: 0.75rem;
    color: var(--klc-color-ui-text-soft);
  }

</style>
