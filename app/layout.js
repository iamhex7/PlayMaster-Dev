import './globals.css'
import DebugLogBar from '@/components/DebugLogBar'

export const metadata = {
  title: 'YourTurn',
  description: 'YourTurn by FOMO Games - AI-powered tabletop gaming. Join a room and play together.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body className="bg-gray-100 min-h-screen">
        {children}
        <DebugLogBar />
      </body>
    </html>
  )
}
