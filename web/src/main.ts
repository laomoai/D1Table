import { createApp } from 'vue'
import { VueQueryPlugin, type VueQueryPluginOptions } from '@tanstack/vue-query'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'
import App from './App.vue'
import router from './router'

// AG Grid 模块注册（全局一次性）
ModuleRegistry.registerModules([AllCommunityModule])

const vueQueryOptions: VueQueryPluginOptions = {
  queryClientConfig: {
    defaultOptions: {
      queries: {
        staleTime: 0,
        refetchOnWindowFocus: true,
      },
    },
  },
}

createApp(App).use(router).use(VueQueryPlugin, vueQueryOptions).mount('#app')
