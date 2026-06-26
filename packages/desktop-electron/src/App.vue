<template>
  <KLineChart :data-fetcher="dataFetcher" />
</template>

<script setup lang="ts">
import KLineChart from '../../vue/src/components/KLineChart.vue'
import { routerDataFetcher } from '@363045841yyt/klinechart-core/controllers'

const dataFetcher = routerDataFetcher
</script>
