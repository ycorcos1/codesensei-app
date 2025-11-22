import { useEffect, useState } from 'react'

const RESULT_STATES = {
  idle: 'idle',
  loading: 'loading',
  success: 'success',
  error: 'error',
}

function HealthCheck() {
  const [status, setStatus] = useState(RESULT_STATES.loading)
  const [healthData, setHealthData] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const fetchHealth = async () => {
      setStatus(RESULT_STATES.loading)
      setErrorMessage('')

      try {
        const apiBaseUrl = import.meta.env.VITE_API_BASE_URL

        if (!apiBaseUrl) {
          throw new Error('API base URL is not configured')
        }

        const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/health`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const data = await response.json()
        setHealthData(data)
        setStatus(RESULT_STATES.success)
      } catch (error) {
        console.error('Health check failed', error)
        setStatus(RESULT_STATES.error)
        setErrorMessage(error.message || 'Unexpected error occurred')
      }
    }

    fetchHealth()
  }, [])

  const renderContent = () => {
    switch (status) {
      case RESULT_STATES.loading:
        return (
          <div className="status loading" role="status" aria-live="polite">
            <span className="spinner" />
            <p>Checking backend connection...</p>
          </div>
        )
      case RESULT_STATES.error:
        return (
          <div
            className="status error"
            role="alert"
            aria-live="assertive"
            data-testid="health-status-error"
          >
            <p className="status-icon" aria-hidden="true">
              ❌
            </p>
            <p className="status-text">Connection Failed</p>
            <p className="error-message">{errorMessage}</p>
          </div>
        )
      case RESULT_STATES.success:
        if (!healthData) {
          return null
        }

        return (
          <div
            className="status success"
            role="status"
            aria-live="polite"
            data-testid="health-status-success"
          >
            <p className="status-icon" aria-hidden="true">
              ✅
            </p>
            <p className="status-text">Backend Connected</p>
            <div className="health-details">
              <p>
                <strong>Service:</strong> {healthData.service}
              </p>
              <p>
                <strong>Status:</strong> {healthData.status}
              </p>
              <p>
                <strong>Version:</strong> {healthData.version}
              </p>
              <p>
                <strong>Environment:</strong> {healthData.environment}
              </p>
              <p>
                <strong>Region:</strong> {healthData.region}
              </p>
              <p>
                <strong>Timestamp:</strong>{' '}
                {new Date(healthData.timestamp).toLocaleString()}
              </p>
            </div>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <section className="health-check" aria-labelledby="health-check-heading">
      <h2 id="health-check-heading">Backend Health Status</h2>
      {renderContent()}
    </section>
  )
}

export default HealthCheck

