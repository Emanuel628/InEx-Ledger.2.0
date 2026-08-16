import { useEffect, useRef } from 'react'
import {
  applyV3PhraseTranslations,
  observeV3PhraseTranslations,
  type AppLanguage,
} from '../lib/i18n'

function getV3Root() {
  return document.getElementById('root')
}

function useV3PhraseTranslations(language: AppLanguage, renderKey: string) {
  const languageRef = useRef(language)

  useEffect(() => {
    languageRef.current = language
  }, [language])

  useEffect(() => {
    const root = getV3Root()
    if (!root) return undefined
    const observer = observeV3PhraseTranslations(root, () => languageRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const root = getV3Root()
    if (!root) return
    window.requestAnimationFrame(() => applyV3PhraseTranslations(root, language))
  }, [language, renderKey])
}

export default useV3PhraseTranslations
