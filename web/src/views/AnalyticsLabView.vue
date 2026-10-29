<template>
  <AppLayout>
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-800">Analytics Lab</h1>
      <p class="text-sm text-gray-500 mt-1">
        Forecasting, backtesting, and member trends from the analytics engine.
      </p>
    </div>
    <AnalyticsLab />
  </AppLayout>
</template>

<script setup>
import AppLayout from '../components/AppLayout.vue'
import AnalyticsLab from '../components/AnalyticsLab.vue'
</script>
