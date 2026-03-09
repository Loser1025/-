import { useState } from 'react'
import './App.css'

interface Location {
  prefecture: string
  city: string
  town: string
  x: string
  y: string
}

interface HeartRailsResponse {
  response: {
    location?: Location[]
    error?: string
  }
}

function formatPostal(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 7)
  if (digits.length > 3) {
    return digits.slice(0, 3) + '-' + digits.slice(3)
  }
  return digits
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

async function fetchLocation(postal: string): Promise<Location> {
  const digits = postal.replace(/\D/g, '')
  const res = await fetch(
    `https://geoapi.heartrails.com/api/json?method=searchByPostal&postal=${digits}`
  )
  const data: HeartRailsResponse = await res.json()
  if (data.response.error || !data.response.location || data.response.location.length === 0) {
    throw new Error(`郵便番号 ${postal} が見つかりませんでした`)
  }
  return data.response.location[0]
}

interface Result {
  distance: number
  address1: string
  address2: string
}

function App() {
  const [postal1, setPostal1] = useState('')
  const [postal2, setPostal2] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Result | null>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setResult(null)

    const digits1 = postal1.replace(/\D/g, '')
    const digits2 = postal2.replace(/\D/g, '')
    if (digits1.length !== 7 || digits2.length !== 7) {
      setError('郵便番号は7桁で入力してください')
      return
    }

    setLoading(true)
    try {
      const [loc1, loc2] = await Promise.all([fetchLocation(postal1), fetchLocation(postal2)])
      const lat1 = parseFloat(loc1.y)
      const lon1 = parseFloat(loc1.x)
      const lat2 = parseFloat(loc2.y)
      const lon2 = parseFloat(loc2.x)
      const distance = haversine(lat1, lon1, lat2, lon2)
      setResult({
        distance,
        address1: `${loc1.prefecture}${loc1.city}${loc1.town}`,
        address2: `${loc2.prefecture}${loc2.city}${loc2.town}`,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '取得中にエラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container">
      <h1 className="title">郵便番号 直線距離計算</h1>
      <form className="form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label>郵便番号 1</label>
          <input
            className="input"
            type="text"
            placeholder="例: 100-0001"
            value={postal1}
            onChange={(e) => setPostal1(formatPostal(e.target.value))}
          />
        </div>
        <div className="form-group">
          <label>郵便番号 2</label>
          <input
            className="input"
            type="text"
            placeholder="例: 530-0001"
            value={postal2}
            onChange={(e) => setPostal2(formatPostal(e.target.value))}
          />
        </div>
        <button className="button" type="submit" disabled={loading}>
          距離を計算する
        </button>
      </form>

      {loading && <p className="loading">取得中...</p>}
      {error && <p className="error">{error}</p>}
      {result && (
        <div className="result">
          <p className="result-title">直線距離</p>
          <p className="result-distance">{result.distance.toFixed(1)} km</p>
          <div className="result-addresses">
            <p className="result-address">📍 {result.address1}</p>
            <p className="result-address">📍 {result.address2}</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
