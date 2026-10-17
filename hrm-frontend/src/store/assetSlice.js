import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { assetService } from '../services/assetService';

export const fetchAssets = createAsyncThunk('assets/fetchAssets', async (_, { rejectWithValue }) => {
  try {
    return await assetService.getAssets();
  } catch (error) {
    return rejectWithValue(error.response?.data?.message || 'Failed to fetch assets');
  }
});

const assetSlice = createSlice({
  name: 'assets',
  initialState: {
    items: [],
    loading: false,
    error: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchAssets.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAssets.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload;
      })
      .addCase(fetchAssets.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export default assetSlice.reducer;
