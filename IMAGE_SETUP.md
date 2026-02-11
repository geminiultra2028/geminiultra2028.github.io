# Sidebar Logo Setup Instructions

## Image File Required

The sidebar now displays a logo image instead of text. To use the image you provided:

### Steps to Complete Setup:

1. **Save the image file**:
   - Save the "Percetakan Keselamatan Nasional" logo image as `logo.png` 
   - Place it in the same directory as `index.html`
   - File path: `c:\Users\DaXRayZ\Desktop\attendance-app\logo.png`

2. **Image Requirements**:
   - Format: PNG, JPG, or any web-compatible format
   - Recommended size: 150px × 150px or larger (will be scaled to max 150px width)
   - Should have transparent or colored background that matches the sidebar

3. **Alternative File Names**:
   If you prefer a different filename, update the `src` attribute in `index.html` line 16:
   ```html
   <img id="sidebarLogo" src="YOUR_FILENAME.png" alt="Attendance App Logo" class="sidebar-logo">
   ```

## How It Works

- The logo displays in the sidebar header where "Attendance App" text was
- The text version is hidden but preserved (can be restored by removing `display: none;`)
- Image automatically responds to dark mode with brightness adjustment
- Logo is responsive and maintains aspect ratio
- Centered in the sidebar header

## Fallback Text

If the image fails to load, the hidden `<h3>` element can be displayed again by:
1. Removing `style="display: none;"` from the h3 element in index.html, OR
2. The alt text "Attendance App Logo" will display as a fallback

## Storage

The logo preference is automatically part of your app setup and stored locally when:
- The page is accessed
- The image file exists in the correct location
- The browser cache stores the image for faster loading
