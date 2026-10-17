export const DOCUMENT_CATEGORIES = {
  Identity: [
    'Aadhaar',
    'PAN',
    'Passport',
    'Driving Licence',
  ],
  Education: [
    '10th',
    '12th',
    'Degree',
    'Certificates',
  ],
  Employment: [
    'Offer Letter',
    'Appointment Letter',
    'Experience Letter',
    'Relieving Letter',
  ],
  Company: [
    'NDA',
    'Policy documents',
    'Agreements',
  ],
};

export const CATEGORY_OPTIONS = Object.keys(DOCUMENT_CATEGORIES);

export const getTypesForCategory = (category) => {
  return DOCUMENT_CATEGORIES[category] || [];
};
