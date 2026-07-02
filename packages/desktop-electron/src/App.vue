<template>
  <KlineChart :data-fetcher="dataFetcher" />
</template>

<script setup lang="ts">
  import { routerDataFetcher } from '@363045841yyt/klinechart-core/controllers'

  import KLineChart from '../../vue/src/components/KLineChart.vue'

  const dataFetcher = routerDataFetcher
</script>
