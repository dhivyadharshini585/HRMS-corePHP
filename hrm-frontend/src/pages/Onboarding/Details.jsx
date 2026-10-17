import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ROUTES } from '../../constants/routes';
import { useAuthContext } from '../../context/AuthContext';
import { 
  getOnboardingDetails, 
  submitChecklistDocument, 
  verifyChecklistItem, 
  rejectChecklistItem, 
  updateItAccountTracking, 
  updateLaptopAllocationTracking,
  createEmployeeRecord,
  completeOnboarding,
  cancelOnboarding,
  downloadChecklistDocument
} from '../../services/onboardingService';

// Minimal valid PDF binary header & structure for test document upload
const samplePdfBytes = new Uint8Array([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xd0, 0xd4, 0xc5, 0xd8, 0x0a,
  0x31, 0x20, 0x30, 0x20, 0x6f, 0x62, 0x6a, 0x0a, 0x3c, 0x3c, 0x2f, 0x54, 0x79, 0x70, 0x65,
  0x20, 0x2f, 0x43, 0x61, 0x74, 0x61, 0x6c, 0x6f, 0x67, 0x20, 0x2f, 0x50, 0x61, 0x67, 0x65,
  0x73, 0x20, 0x32, 0x20, 0x30, 0x20, 0x52, 0x3e, 0x3e, 0x0a, 0x65, 0x6e, 0x64, 0x6f, 0x62,
  0x6a, 0x0a, 0x32, 0x20, 0x30, 0x20, 0x6f, 0x62, 0x6a, 0x0a, 0x3c, 0x3c, 0x2f, 0x54, 0x79,
  0x70, 0x65, 0x20, 0x2f, 0x50, 0x61, 0x67, 0x65, 0x73, 0x20, 0x2f, 0x4b, 0x69, 0x64, 0x73,
  0x20, 0x5b, 0x33, 0x20, 0x30, 0x20, 0x52, 0x5d, 0x20, 0x2f, 0x43, 0x6f, 0x75, 0x6e, 0x74,
  0x20, 0x31, 0x3e, 0x3e, 0x0a, 0x65, 0x6e, 0x64, 0x6f, 0x62, 0x6a, 0x0a, 0x33, 0x20, 0x30,
  0x20, 0x6f, 0x62, 0x6a, 0x0a, 0x3c, 0x3c, 0x2f, 0x54, 0x79, 0x70, 0x65, 0x20, 0x2f, 0x50,
  0x61, 0x67, 0x65, 0x20, 0x2f, 0x50, 0x61, 0x72, 0x65, 0x6e, 0x74, 0x20, 0x32, 0x20, 0x30,
  0x20, 0x52, 0x20, 0x2f, 0x4d, 0x65, 0x64, 0x69, 0x61, 0x42, 0x6f, 0x78, 0x20, 0x5b, 0x30,
  0x20, 0x30, 0x20, 0x36, 0x31, 0x32, 0x20, 0x37, 0x39, 0x32, 0x5d, 0x3e, 0x3e, 0x0a, 0x65,
  0x6e, 0x64, 0x6f, 0x62, 0x6a, 0x0a, 0x78, 0x72, 0x65, 0x66, 0x0a, 0x30, 0x20, 0x34, 0x0a,
  0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x20, 0x36, 0x35, 0x35, 0x33,
  0x35, 0x20, 0x66, 0x20, 0x0a, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x31, 0x35,
  0x20, 0x30, 0x30, 0x30, 0x30, 0x30, 0x20, 0x6e, 0x20, 0x0a, 0x30, 0x30, 0x30, 0x30, 0x30,
  0x30, 0x30, 0x30, 0x36, 0x38, 0x20, 0x30, 0x30, 0x30, 0x30, 0x30, 0x20, 0x6e, 0x20, 0x0a,
  0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x31, 0x32, 0x35, 0x20, 0x30, 0x30, 0x30, 0x30,
  0x30, 0x20, 0x6e, 0x20, 0x0a, 0x74, 0x72, 0x61, 0x69, 0x6c, 0x65, 0x72, 0x0a, 0x3c, 0x3c,
  0x2f, 0x53, 0x69, 0x7a, 0x65, 0x20, 0x34, 0x20, 0x2f, 0x52, 0x6f, 0x6f, 0x74, 0x20, 0x31,
  0x20, 0x30, 0x20, 0x52, 0x3e, 0x3e, 0x0a, 0x73, 0x74, 0x61, 0x72, 0x74, 0x78, 0x72, 0x65,
  0x66, 0x0a, 0x32, 0x30, 0x39, 0x0a, 0x25, 0x25, 0x45, 0x4f, 0x46, 0x0a
]);

const OnboardingDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, hasRole, hasPermission } = useAuthContext();
  const canVerify = !user || hasRole('HR Admin') || hasRole('Super Admin') || hasPermission('recruitment.onboarding.verify');

  const [onboarding, setOnboarding] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal states
  const [rejectModal, setRejectModal] = useState({ open: false, itemId: null, remarks: '' });
  const [submitModal, setSubmitModal] = useState({ open: false, itemId: null, file: null });
  const [confirmModal, setConfirmModal] = useState({ open: false, title: '', message: '', onConfirm: null, confirmText: 'Confirm' });

  const fetchDetails = async () => {
    setLoading(true);
    try {
      const res = await getOnboardingDetails(id);
      setOnboarding(res.data);
      setError(null);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [id]);

  const handleVerify = async (itemId) => {
    try {
      await verifyChecklistItem(id, itemId);
      fetchDetails();
    } catch (err) {
      alert(err?.response?.data?.message || 'Verification failed');
    }
  };

  const handleReject = async () => {
    if (!rejectModal.remarks.trim()) {
      alert('Remarks are required');
      return;
    }
    try {
      await rejectChecklistItem(id, rejectModal.itemId, rejectModal.remarks);
      setRejectModal({ open: false, itemId: null, remarks: '' });
      fetchDetails();
    } catch (err) {
      alert(err?.response?.data?.message || 'Rejection failed');
    }
  };

  const handleSubmitDoc = async (e) => {
    e.preventDefault();
    if (!submitModal.file) {
      alert('Please select a file');
      return;
    }
    try {
      await submitChecklistDocument(id, submitModal.itemId, submitModal.file);
      setSubmitModal({ open: false, itemId: null, file: null });
      fetchDetails();
    } catch (err) {
      alert(err?.response?.data?.message || 'Upload failed');
    }
  };

  const handleUpdateSetup = async (type, status) => {
    try {
      if (type === 'IT') {
        await updateItAccountTracking(id, status, null);
      } else {
        await updateLaptopAllocationTracking(id, status, null);
      }
      fetchDetails();
    } catch (err) {
      alert(err?.response?.data?.message || 'Update failed');
    }
  };

  const handleCreateEmployee = () => {
    setConfirmModal({
      open: true,
      title: 'Create Employee',
      message: 'Are you sure you want to create the Employee record?',
      confirmText: 'Confirm Create Employee',
      onConfirm: async () => {
        try {
          await createEmployeeRecord(id);
          setConfirmModal({ open: false, title: '', message: '', onConfirm: null, confirmText: 'Confirm' });
          fetchDetails();
        } catch (err) {
          alert(err?.response?.data?.message || 'Failed to create employee');
        }
      }
    });
  };

  const handleComplete = () => {
    setConfirmModal({
      open: true,
      title: 'Complete Onboarding',
      message: 'Mark this onboarding as Completed and activate the Employee?',
      confirmText: 'Confirm Complete Onboarding',
      onConfirm: async () => {
        try {
          await completeOnboarding(id);
          setConfirmModal({ open: false, title: '', message: '', onConfirm: null, confirmText: 'Confirm' });
          fetchDetails();
        } catch (err) {
          alert(err?.response?.data?.message || 'Completion failed');
        }
      }
    });
  };

  const handleCancel = async () => {
    if (window.confirm('Cancel this onboarding process? This cannot be undone.')) {
      try {
        await cancelOnboarding(id);
        fetchDetails();
      } catch (err) {
        alert(err?.response?.data?.message || 'Cancellation failed');
      }
    }
  };

  const handleDownload = async (itemId) => {
    try {
      await downloadChecklistDocument(id, itemId);
    } catch (err) {
      alert('Failed to download document');
    }
  };

  if (loading) {
    return <div className="page-container"><div className="loading-state"><div className="spinner"></div><p>Loading details...</p></div></div>;
  }

  if (error || !onboarding) {
    return <div className="page-container"><div className="alert alert-error">{error || 'Not found'}</div></div>;
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Completed': 
      case 'Verified': 
      case 'Active': return <span className="status-badge status-active">{status}</span>;
      case 'In Progress': 
      case 'Submitted': return <span className="status-badge status-info">{status}</span>;
      case 'Cancelled': 
      case 'Rejected': return <span className="status-badge status-inactive">{status}</span>;
      case 'Pending':
      default: return <span className="status-badge status-warning">{status}</span>;
    }
  };

  const isItemVerified = (itemId) => {
    return onboarding.checklist_items?.find(i => i.id === itemId)?.status === 'Verified';
  };

  const getExpectedDocName = (itemId) => {
    const item = onboarding?.checklist_items?.find(i => i.id === itemId);
    if (!item) return 'document.pdf';
    return `${item.item_type.toLowerCase().replace(/[^a-z0-9]/g, '_')}.pdf`;
  };

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="header-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '8px' }}>
            <button onClick={() => navigate(ROUTES.ONBOARDING)} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
              Back
            </button>
            <h1 style={{ margin: 0 }}>Onboarding Details</h1>
            {getStatusBadge(onboarding.status)}
          </div>
          <p>Candidate: {onboarding.candidate?.full_name} | Joining: {new Date(onboarding.joining_date).toLocaleDateString()}</p>
        </div>
        
        {onboarding.status !== 'Completed' && onboarding.status !== 'Cancelled' && (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn btn-secondary" onClick={handleCancel}>Cancel Process</button>
            
            {!onboarding.employee_id && (
               <button className="btn btn-primary" onClick={handleCreateEmployee}>Create Employee</button>
            )}

            {onboarding.employee_id && (
               <button className="btn btn-primary" onClick={handleComplete}>Complete Onboarding</button>
            )}
          </div>
        )}
      </div>

      {/* Progress Bar */}
      <div className="detail-card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>Overall Progress</h3>
          <span style={{ fontWeight: '600' }}>{onboarding.progress_percentage}%</span>
        </div>
        <div style={{ width: '100%', backgroundColor: '#e2e8f0', borderRadius: '8px', height: '12px', overflow: 'hidden' }}>
          <div style={{ width: `${onboarding.progress_percentage}%`, backgroundColor: onboarding.progress_percentage === 100 ? '#10b981' : '#075E4B', height: '100%', transition: 'width 0.3s ease' }}></div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '24px' }}>
        <div className="detail-card">
          <h3>Candidate Information</h3>
          <div className="detail-grid">
             <div className="detail-item">
               <span className="detail-label">Name</span>
               <span className="detail-value">{onboarding.candidate?.full_name}</span>
             </div>
             <div className="detail-item">
               <span className="detail-label">Email</span>
               <span className="detail-value">{onboarding.candidate?.email}</span>
             </div>
             <div className="detail-item">
               <span className="detail-label">Phone</span>
               <span className="detail-value">{onboarding.candidate?.phone}</span>
             </div>
          </div>
        </div>
        <div className="detail-card">
          <h3>Offer Information</h3>
          <div className="detail-grid">
             <div className="detail-item">
               <span className="detail-label">Offer Code</span>
               <span className="detail-value">{onboarding.offer_letter?.offer_code}</span>
             </div>
             <div className="detail-item">
               <span className="detail-label">Designation</span>
               <span className="detail-value">{onboarding.offer_letter?.designation || onboarding.offer_letter?.job_opening?.title}</span>
             </div>
             <div className="detail-item">
               <span className="detail-label">Joining Date</span>
               <span className="detail-value">{new Date(onboarding.joining_date).toLocaleDateString()}</span>
             </div>
          </div>
        </div>
      </div>

      {onboarding.employee_id && (
        <div className="detail-card" style={{ marginBottom: '24px', borderLeft: '4px solid #10b981' }}>
          <h3>Employee Record Created</h3>
          <div className="detail-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
             <div className="detail-item">
               <span className="detail-label">Employee Code</span>
               <span className="detail-value font-medium">{onboarding.employee?.employee_code}</span>
             </div>
             <div className="detail-item">
               <span className="detail-label">Status</span>
               <span className="detail-value">{getStatusBadge(onboarding.employee?.employment_status)}</span>
             </div>
             <div className="detail-item">
               <button 
                 className="btn btn-secondary btn-sm" 
                 onClick={() => navigate(ROUTES.EMPLOYEE_VIEW.replace(':id', onboarding.employee_id))}
               >
                 View Profile
               </button>
             </div>
          </div>
        </div>
      )}

      {/* IT & Setup */}
      <div className="detail-card" style={{ marginBottom: '24px' }}>
         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
           <h3 style={{ margin: 0 }}>IT & Assets Setup</h3>
         </div>
         <div className="table-responsive">
           <table className="data-table">
             <thead>
               <tr>
                 <th>Setup Task</th>
                 <th>Status</th>
                 <th>Actions</th>
               </tr>
             </thead>
             <tbody>
               <tr>
                 <td className="font-medium">IT Account Creation</td>
                 <td>{getStatusBadge(onboarding.it_account_status)}</td>
                 <td>
                   {onboarding.status !== 'Completed' && (
                     <div className="action-buttons">
                       <button className="btn btn-sm btn-secondary" onClick={() => handleUpdateSetup('IT', 'Pending')}>Pending</button>
                       <button className="btn btn-sm btn-secondary" onClick={() => handleUpdateSetup('IT', 'Not Applicable')}>N/A</button>
                       <button className="btn btn-sm btn-primary" onClick={() => handleUpdateSetup('IT', 'Completed')}>Completed</button>
                     </div>
                   )}
                 </td>
               </tr>
               <tr>
                 <td className="font-medium">Laptop Allocation</td>
                 <td>{getStatusBadge(onboarding.laptop_allocation_status)}</td>
                 <td>
                   {onboarding.status !== 'Completed' && (
                     <div className="action-buttons">
                       <button className="btn btn-sm btn-secondary" onClick={() => handleUpdateSetup('Laptop', 'Pending')}>Pending</button>
                       <button className="btn btn-sm btn-secondary" onClick={() => handleUpdateSetup('Laptop', 'Not Applicable')}>N/A</button>
                       <button className="btn btn-sm btn-primary" onClick={() => handleUpdateSetup('Laptop', 'Completed')}>Completed</button>
                     </div>
                   )}
                 </td>
               </tr>
             </tbody>
           </table>
         </div>
      </div>

      {/* Document Checklist */}
      <div className="detail-card">
         <h3 style={{ marginBottom: '16px' }}>Document Checklist</h3>
         <div className="table-responsive">
           <table className="data-table">
             <thead>
               <tr>
                 <th>Document Type</th>
                 <th>Status</th>
                 <th>Document</th>
                 <th>Remarks</th>
                 <th>Actions</th>
               </tr>
             </thead>
             <tbody>
               {onboarding.checklist_items?.map(item => (
                 <tr key={item.id}>
                   <td className="font-medium">{item.item_type}</td>
                   <td>{getStatusBadge(item.status)}</td>
                   <td>
                      {item.document ? (
                        <button className="text-blue-600 hover:text-blue-800 text-sm font-medium" onClick={() => handleDownload(item.id)}>
                          {item.document.original_name}
                        </button>
                      ) : (
                        <span className="text-gray-400 text-sm">Not uploaded</span>
                      )}
                   </td>
                   <td><span className="text-sm text-gray-600">{item.remarks || '-'}</span></td>
                   <td>
                     {onboarding.status !== 'Completed' && (
                       <div className="action-buttons">
                         {(item.status === 'Pending' || item.status === 'Rejected') && (
                            <button className="btn btn-sm btn-secondary" onClick={() => setSubmitModal({ open: true, itemId: item.id, file: null })}>
                              Upload
                            </button>
                         )}
                         {item.status === 'Submitted' && (
                            <>
                              <button className="btn btn-sm btn-primary" onClick={() => handleVerify(item.id)}>Verify</button>
                              <button className="btn btn-sm btn-secondary" onClick={() => setRejectModal({ open: true, itemId: item.id, remarks: '' })}>Reject</button>
                            </>
                         )}
                         {item.status === 'Verified' && item.item_type !== 'Offer Letter' && canVerify && (
                            <button 
                              className="btn btn-sm btn-secondary" 
                              onClick={() => setRejectModal({ 
                                open: true, 
                                itemId: item.id, 
                                remarks: 'Incorrect test document - replacing with correct document.' 
                              })}
                              title="Replace with correct document"
                            >
                              Re-upload
                            </button>
                         )}
                       </div>
                     )}
                   </td>
                 </tr>
               ))}
             </tbody>
           </table>
         </div>
      </div>

      {/* Upload Modal */}
      {submitModal.open && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Upload Document</h2>
              <button className="modal-close" onClick={() => setSubmitModal({ open: false, itemId: null, file: null })}>&times;</button>
            </div>
            <form onSubmit={handleSubmitDoc}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Select File (Max 5MB)</label>
                  <input 
                    type="file" 
                    id="doc-file-input"
                    className="form-control" 
                    onChange={(e) => setSubmitModal({...submitModal, file: e.target.files[0]})} 
                  />
                  <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <button 
                      type="button" 
                      className="btn btn-secondary btn-sm"
                      id="use-sample-doc-btn"
                      onClick={() => {
                        const filename = getExpectedDocName(submitModal.itemId);
                        const sampleFile = new File([samplePdfBytes], filename, { type: 'application/pdf' });
                        setSubmitModal({ ...submitModal, file: sampleFile });
                      }}
                    >
                      Attach Sample {getExpectedDocName(submitModal.itemId)}
                    </button>
                    {submitModal.file && (
                      <span style={{ fontSize: '0.85rem', color: '#16a34a', fontWeight: 500 }}>
                        ✓ {submitModal.file.name}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setSubmitModal({ open: false, itemId: null, file: null })}>Cancel</button>
                <button type="submit" className="btn btn-primary" id="confirm-upload-btn" disabled={!submitModal.file}>Upload</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal.open && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>{isItemVerified(rejectModal.itemId) ? 'Re-upload / Replace Document' : 'Reject Document'}</h2>
              <button className="modal-close" onClick={() => setRejectModal({ open: false, itemId: null, remarks: '' })}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>{isItemVerified(rejectModal.itemId) ? 'Replacement Remarks' : 'Rejection Remarks'} <span className="required">*</span></label>
                <textarea 
                  className="form-control" 
                  rows="3" 
                  value={rejectModal.remarks}
                  onChange={(e) => setRejectModal({...rejectModal, remarks: e.target.value})}
                  placeholder="Reason for rejecting / replacing this document..."
                  required
                ></textarea>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setRejectModal({ open: false, itemId: null, remarks: '' })}>Cancel</button>
              <button className="btn btn-danger" onClick={handleReject} style={{ backgroundColor: '#ef4444', color: 'white', border: 'none' }}>
                {isItemVerified(rejectModal.itemId) ? 'Confirm Re-upload' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal.open && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>{confirmModal.title}</h2>
              <button className="modal-close" onClick={() => setConfirmModal({ open: false, title: '', message: '', onConfirm: null, confirmText: 'Confirm' })}>&times;</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '1rem', color: '#374151' }}>{confirmModal.message}</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setConfirmModal({ open: false, title: '', message: '', onConfirm: null, confirmText: 'Confirm' })}>Cancel</button>
              <button className="btn btn-primary" id="confirm-action-modal-btn" onClick={confirmModal.onConfirm}>
                {confirmModal.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default OnboardingDetails;
