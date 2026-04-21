/**
 * 漫画源类型联合类型
 * - archive: 压缩包格式（CBZ/CBR/CBT/ZIP/RAR/7Z）
 * - pdf: PDF 文档
 * - folder: 文件夹目录（包含图片文件）
 */
export type SourceType = 'archive' | 'pdf' | 'folder'

/** 所有合法的 SourceType 值 */
export const VALID_SOURCE_TYPES: SourceType[] = ['archive', 'pdf', 'folder']

/** 运行时校验：判断字符串是否为合法的 SourceType */
export function isValidSourceType(value: string): value is SourceType {
  return (VALID_SOURCE_TYPES as string[]).includes(value)
}

/** 获取 SourceType 的显示名称 */
export function getSourceTypeDisplayName(type: SourceType): string {
  const displayNames: Record<SourceType, string> = {
    archive: '压缩包',
    pdf: 'PDF',
    folder: '文件夹',
  }
  return displayNames[type]
}

/** 判断是否为文件类型（非文件夹） */
export function isFileBasedSource(type: SourceType): boolean {
  return type === 'archive' || type === 'pdf'
}

/** 根据文件路径推断 SourceType */
export function inferSourceType(path: string): SourceType {
  const ext = path.substring(path.lastIndexOf('.')).toLowerCase()
  if (ext === '.pdf') return 'pdf'
  if (['.cbz', '.cbr', '.cbt', '.zip', '.rar', '.7z'].includes(ext)) return 'archive'
  return 'folder'
}
