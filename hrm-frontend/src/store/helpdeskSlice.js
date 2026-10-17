import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { helpdeskService } from '../services/helpdeskService';

export const fetchTickets = createAsyncThunk('helpdesk/fetchTickets', async (_, { rejectWithValue }) => {
  try {
    return await helpdeskService.getTickets();
  } catch (error) {
    return rejectWithValue(error.response?.data?.message || 'Failed to fetch tickets');
  }
});

const helpdeskSlice = createSlice({
  name: 'helpdesk',
  initialState: {
    items: [],
    loading: false,
    error: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchTickets.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTickets.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload;
      })
      .addCase(fetchTickets.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export default helpdeskSlice.reducer;
