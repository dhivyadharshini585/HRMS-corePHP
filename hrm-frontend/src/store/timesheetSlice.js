import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { timesheetService } from '../services/timesheetService';

export const fetchTimesheets = createAsyncThunk('timesheets/fetchTimesheets', async (_, { rejectWithValue }) => {
  try {
    return await timesheetService.getTimesheets();
  } catch (error) {
    return rejectWithValue(error.response?.data?.message || 'Failed to fetch timesheets');
  }
});

const timesheetSlice = createSlice({
  name: 'timesheets',
  initialState: {
    items: [],
    loading: false,
    error: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchTimesheets.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTimesheets.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload;
      })
      .addCase(fetchTimesheets.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export default timesheetSlice.reducer;
