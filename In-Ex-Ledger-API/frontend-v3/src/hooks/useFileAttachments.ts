import { useRef, useState, type ChangeEvent } from 'react'

export const MAX_FILE_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const MAX_FILE_ATTACHMENTS = 5
export const FILE_ATTACHMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.txt,.csv,.doc,.docx,.xls,.xlsx'

export default function useFileAttachments() {
  const [attachments, setAttachments] = useState<File[]>([])
  const [attachmentError, setAttachmentError] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  function handleAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length) return
    if (attachments.length + files.length > MAX_FILE_ATTACHMENTS) {
      setAttachmentError(`You can attach up to ${MAX_FILE_ATTACHMENTS} files.`)
      return
    }
    if (files.some((file) => file.size > MAX_FILE_ATTACHMENT_BYTES)) {
      setAttachmentError('Each attachment must be 10 MB or smaller.')
      return
    }
    setAttachmentError('')
    setAttachments((current) => [...current, ...files])
  }

  function removeAttachment(index: number) {
    setAttachments((current) => current.filter((_, fileIndex) => fileIndex !== index))
  }

  function clearAttachments() {
    setAttachments([])
    setAttachmentError('')
  }

  return {
    attachments,
    attachmentError,
    fileInputRef,
    handleAttachmentChange,
    removeAttachment,
    clearAttachments,
    maxAttachments: MAX_FILE_ATTACHMENTS,
    accept: FILE_ATTACHMENT_ACCEPT,
  }
}
