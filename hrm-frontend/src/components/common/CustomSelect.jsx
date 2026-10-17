import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';

const CustomSelect = ({ children, value, onChange, name, disabled, required, className, style, placeholder }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const dropdownRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect();
      // Position it exactly below the trigger, accounting for scroll
      setDropdownPosition({
        top: rect.bottom + 4, // 4px gap
        left: rect.left,
        width: rect.width
      });
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      const isOutsideTrigger = dropdownRef.current && !dropdownRef.current.contains(event.target);
      const isOutsideMenu = menuRef.current && !menuRef.current.contains(event.target);
      
      if (isOutsideTrigger && isOutsideMenu) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const extractOptions = (nodes) => {
    let opts = [];
    React.Children.forEach(nodes, child => {
      if (!child) return;
      if (child.type === 'option') {
        opts.push({
          value: child.props.value,
          label: child.props.children,
          disabled: child.props.disabled
        });
      } else if (child.props && child.props.children) {
        opts = opts.concat(extractOptions(child.props.children));
      }
    });
    return opts;
  };

  const options = extractOptions(children);
  const selectedOption = options.find(opt => String(opt.value) === String(value));

  const handleSelect = (opt) => {
    if (opt.disabled) return;
    if (onChange) {
      // Create a synthetic event object to match native onChange signature
      onChange({
        target: { name, value: opt.value }
      });
    }
    setIsOpen(false);
  };

  return (
    <div className={`custom-dropdown-container ${className || ''}`} ref={dropdownRef} style={{ position: 'relative', width: '100%', ...style }}>
      <div 
        className={`form-control ${disabled ? 'disabled' : ''}`}
        style={{ 
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
          cursor: disabled ? 'not-allowed' : 'pointer', 
          border: isOpen ? '1px solid #075E4B' : '1px solid #E2E8E5',
          boxShadow: isOpen ? '0 0 0 2px rgba(7, 94, 75, 0.1)' : 'none',
          backgroundColor: disabled ? '#f1f5f9' : '#FFFFFF', 
          color: disabled ? '#94a3b8' : '#123B35', 
          padding: '0.375rem 0.75rem',
          minHeight: '38px',
          borderRadius: '4px',
          transition: 'border-color 0.2s, box-shadow 0.2s'
        }}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen(!isOpen);
          } else if (e.key === 'Escape') {
            setIsOpen(false);
          }
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedOption ? selectedOption.label : (placeholder || 'Select...')}
        </span>
        <span style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', fontSize: '0.8rem', opacity: 0.7, color: '#064E3B' }}>▼</span>
      </div>
      
      {isOpen && ReactDOM.createPortal(
        <div 
          ref={menuRef}
          style={{
          position: 'fixed', 
          top: dropdownPosition.top, 
          left: dropdownPosition.left, 
          width: dropdownPosition.width,
          zIndex: 9999,
          backgroundColor: '#FFFFFF', border: '1px solid #E2E8E5', borderRadius: '6px',
          boxShadow: '0 4px 12px -1px rgba(0, 0, 0, 0.1)',
          maxHeight: '250px', overflowY: 'auto'
        }}>
          {options.length === 0 ? (
            <div style={{ padding: '0.5rem 0.75rem', color: '#64748B', fontSize: '0.85rem' }}>No options available</div>
          ) : options.map((opt, idx) => (
            <div
              key={idx}
              style={{
                padding: '0.5rem 0.75rem', 
                cursor: opt.disabled ? 'not-allowed' : 'pointer',
                backgroundColor: String(value) === String(opt.value) ? '#DDF7EC' : 'transparent',
                color: opt.disabled ? '#94a3b8' : (String(value) === String(opt.value) ? '#064E3B' : '#123B35'),
                fontWeight: String(value) === String(opt.value) ? 600 : 400,
                fontSize: '0.9rem',
                transition: 'background-color 0.15s'
              }}
              onMouseEnter={(e) => {
                if (!opt.disabled && String(value) !== String(opt.value)) e.currentTarget.style.backgroundColor = '#f8faf9';
              }}
              onMouseLeave={(e) => {
                if (!opt.disabled && String(value) !== String(opt.value)) e.currentTarget.style.backgroundColor = 'transparent';
              }}
              onClick={() => handleSelect(opt)}
            >
              {opt.label}
            </div>
          ))}
        </div>,
        document.body
      )}
      <input 
        type="text" 
        name={name}
        required={required}
        value={value !== undefined && value !== null ? value : ''} 
        onChange={() => {}} 
        style={{ position: 'absolute', opacity: 0, height: 0, width: 0, pointerEvents: 'none' }} 
        tabIndex={-1}
      />
    </div>
  );
};
export default CustomSelect;
