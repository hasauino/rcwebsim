import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './ui/App.vue'
import './ui/theme.css'

createApp(App).use(createPinia()).mount('#app')
