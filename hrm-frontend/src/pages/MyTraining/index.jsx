import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import '../../styles/common.css';

function MyTraining() {
  const [attendances, setAttendances] = useState([]);
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadingDocId, setDownloadingDocId] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError('');
      try {
        const [trainingsRes, certsRes] = await Promise.all([
          api.get('/training-attendees'),
          api.get('/documents?category=Certificate')
        ]);

        let attData = trainingsRes.data;
        if (attData && !Array.isArray(attData) && Array.isArray(attData.data)) {
          attData = attData.data;
        }
        setAttendances(Array.isArray(attData) ? attData : []);

        let certsData = certsRes.data;
        if (certsData && !Array.isArray(certsData) && Array.isArray(certsData.data)) {
          certsData = certsData.data;
        }
        setCertificates(Array.isArray(certsData) ? certsData : []);

      } catch (err) {
        console.error(err);
        setError('Failed to load training data.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleDownloadCertificate = async (doc) => {
    try {
      setDownloadingDocId(doc.id);
      const response = await api.get(`/documents/${doc.id}/download`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      // Determine file extension
      let extension = '.pdf';
      if (doc.file_path) {
        const parts = doc.file_path.split('.');
        if (parts.length > 1) {
          extension = '.' + parts[parts.length - 1];
        }
      }

      link.setAttribute('download', doc.document_name + extension);
      document.body.appendChild(link);
      link.click();
      
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Failed to download certificate.');
    } finally {
      setDownloadingDocId(null);
    }
  };

  const renderCertificateAction = (attendance) => {
    if (attendance.completion_status !== 'completed') {
      return <span style={{ color: '#6b7280' }}>Not Available</span>;
    }

    const docName = `${attendance.training?.training_name} Certificate`;
    const certDoc = certificates.find(c => c.document_name === docName);

    if (!certDoc) {
      return <span style={{ color: '#d97706' }}>Certificate Pending</span>;
    }

    return (
      <button 
        className="btn-primary" 
        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
        onClick={() => handleDownloadCertificate(certDoc)}
        disabled={downloadingDocId === certDoc.id}
      >
        {downloadingDocId === certDoc.id ? 'Downloading...' : 'Download Certificate'}
      </button>
    );
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return dateString.split('T')[0];
  };

  const getStatusBadgeClass = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed': return 'badge-success';
      case 'enrolled': return 'badge-primary';
      case 'failed': return 'badge-danger';
      case 'dropped': return 'badge-neutral';
      default: return 'badge-neutral';
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2 className="page-title">My Training</h2>
          <p className="page-subtitle">View your enrolled trainings and download certificates</p>
        </div>
      </div>

      {error && <div className="alert-banner error" style={{ marginBottom: '1rem' }}>{error}</div>}

      <div className="table-container">
        {loading ? (
          <div className="state-container">
            <p>Loading trainings...</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Training Name</th>
                <th>Trainer</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Status</th>
                <th>Certificate</th>
              </tr>
            </thead>
            <tbody>
              {attendances.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '1rem' }}>No trainings found.</td>
                </tr>
              ) : (
                attendances.map(a => (
                  <tr key={a.id}>
                    <td><strong>{a.training?.training_name}</strong></td>
                    <td>{a.training?.trainer ? `${a.training.trainer.first_name} ${a.training.trainer.last_name}` : 'N/A'}</td>
                    <td>{formatDate(a.training?.start_date)}</td>
                    <td>{formatDate(a.training?.end_date)}</td>
                    <td>
                      <span className={`badge ${getStatusBadgeClass(a.completion_status)}`}>
                        {(a.completion_status || '').toUpperCase()}
                      </span>
                    </td>
                    <td>
                      {renderCertificateAction(a)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default MyTraining;
