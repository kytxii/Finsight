import client from './client'
import * as demo from './demoStore'

const isDemo = () => localStorage.getItem('demo') === 'true'

export const previewImport = (file) => {
  if (isDemo()) return demo.previewImport(file)
  const formData = new FormData()
  formData.append('file', file)
  return client.post('/imports/preview', formData)
}

export const commitImport = (data) => isDemo() ? demo.commitImport(data) : client.post('/imports/commit', data)

export const aiCleanupNames = (names) => isDemo() ? demo.aiCleanupNames(names) : client.post('/imports/ai-cleanup', { names })
