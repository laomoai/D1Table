<template>
  <n-config-provider :theme-overrides="themeOverrides" :locale="zhCN" :date-locale="dateZhCN">
    <n-message-provider>
      <n-dialog-provider>
        <router-view />
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { NConfigProvider, NMessageProvider, NDialogProvider, zhCN, dateZhCN } from 'naive-ui'

const themeOverrides = {
  common: {
    // 主色：Notion 蓝（仅用于链接/强调，减少蓝色面积）
    primaryColor: '#2383e2',
    primaryColorHover: '#0b6bcb',
    primaryColorPressed: '#0958a8',
    primaryColorSuppl: '#2383e2',
    // 字体
    fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif",
    // 正文颜色：Notion 暖黑
    textColor1: '#37352f',
    textColor2: '#37352f',
    textColor3: '#787774',
    placeholderColor: '#a3a19d',
    // 圆角：统一 3px
    borderRadius: '3px',
    borderRadiusSmall: '3px',
    // 边框：极浅，弱化存在感
    borderColor: '#e9e9e7',
    dividerColor: '#e9e9e7',
    // 背景
    bodyColor: '#ffffff',
    cardColor: '#ffffff',
    modalColor: '#ffffff',
    popoverColor: '#ffffff',
    tableColor: '#ffffff',
    tableHeaderColor: '#f7f7f5',
    inputColor: '#ffffff',
  },
  Button: {
    borderRadiusTiny: '3px',
    borderRadiusSmall: '3px',
    borderRadiusMedium: '3px',
    borderRadiusLarge: '3px',
  },
  Input: {
    borderRadius: '3px',
    borderColor: '#e9e9e7',
    borderHoverColor: '#b3b0ab',
    borderFocusColor: '#2383e2',
  },
  Select: { borderRadius: '3px' },
  Drawer: { borderRadius: '0px' },
  Dropdown: {
    borderRadius: '4px',
    color: '#ffffff',
    textColor: '#37352f',
    optionTextColor: '#37352f',
    optionTextColorHover: '#37352f',
    optionTextColorActive: '#37352f',
    optionColorHover: 'rgba(55, 53, 47, 0.06)',
    optionColorActive: 'rgba(55, 53, 47, 0.08)',
    dividerColor: '#e9e9e7',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0,0,0,0.06)',
    padding: '4px',
    optionHeight: '32px',
    optionIconSizeSmall: '14px',
    fontSize: '14px',
  },
}
</script>
