# Seabird Nest Camera Annotation Shiny App

A Python Shiny application for annotating and analyzing seabird nest camera images.

## Overview

This tool enables researchers to upload, view, and annotate seabird nest camera images. It supports both sequence annotations across multiple images and single image observations. All annotations can be synchronized to Google Sheets for collaborative analysis.

## Features

- Upload and process multiple JPG/PNG images
- Navigate through image collections with intuitive controls
- Mark start and end points for behavioral sequences
- Record single image observations
- Extract timestamps from EXIF metadata
- Capture essential metadata:
    - Camera ID
    - Site location
    - Species identification
    - Behavioral observations
    - Reviewer information
- Local session data persistence
- Google Sheets integration for team collaboration

## Requirements

- Python 3.7+
- Required packages:
    - shiny
    - shinyswatch
    - pandas
    - pillow (PIL)
    - gspread
    - google-auth
    - faicons

Install dependencies:
```bash
pip install -r requirements.txt
```

## Setup

### Google Sheets API Configuration

1. Create a service account in Google Cloud Console:
     - Enable the Google Drive and Google Sheets APIs
     - Download the credentials JSON file
     - Save as `credentials.json` in the application directory

2. Google Sheets Integration:
     - The application creates a sheet called "Bird monitoring data"
     - Ensure the service account has appropriate permissions

## Usage

1. Launch the application:
```bash
     shiny run app.py
```

2. Upload your images:
     - Select multiple files using the file browser
     - Images are automatically sorted by filename

3. Annotation workflow:
     - Navigate using Previous/Next controls
     - For sequences: Mark start and end points with checkboxes
     - For single events: Use the "Single Image Observation" option
     - Complete all required metadata fields

4. Data management:
     - Save annotations to your session table
     - Review saved data in the interactive table view

5. Cloud synchronization:
     - Export data to Google Sheets for team access
     - Data is appended to existing records

## Troubleshooting

### Google Sheets Connection
- Verify `credentials.json` is present and valid
- Confirm service account permissions
- Check Google API activation status

### Image Processing
- Ensure images are valid JPG/PNG formats
- Allow processing time for high-resolution files

### Metadata Extraction
- Some images may lack EXIF timestamp data
- Manual timestamp entry is supported when needed

## License

This project is available for research and educational purposes.
