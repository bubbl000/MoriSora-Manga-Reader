import { useEffect, useState } from 'react'
import LibraryView from './components/LibraryView'
import ReaderView from './components/ReaderView'

function App() {
  const [isReader, setIsReader] = useState(false)

  useEffect(() => {
    const checkWindowType = () => {
      const hash = window.location.hash
      const isReaderMode = hash.startsWith('#/reader') || hash.startsWith('#reader')
      console.log('App checkWindowType:', { hash, isReaderMode })
      setIsReader(isReaderMode)
    }

    checkWindowType()
    window.addEventListener('hashchange', checkWindowType)
    return () => window.removeEventListener('hashchange', checkWindowType)
  }, [])

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      {isReader ? <ReaderView /> : <LibraryView />}
    </div>
  )
}

export default App
