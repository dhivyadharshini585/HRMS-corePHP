import { configureStore } from '@reduxjs/toolkit';
import assetReducer from './assetSlice';
import timesheetReducer from './timesheetSlice';
import helpdeskReducer from './helpdeskSlice';

export const store = configureStore({
  reducer: {
    assets: assetReducer,
    timesheets: timesheetReducer,
    helpdesk: helpdeskReducer,
  },
});
