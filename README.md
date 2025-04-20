# Seabird Nest Camera Annotation Shiny App

A Shiny application for Python that allows users to annotate and analyze images from seabird nest cameras.

## Overview

This tool allows researchers to upload, view, and annotate seabird nest camera images. It supports both sequence annotations (spanning multiple images) and single image observations. All annotations can be synced to Google Sheets for further analysis.

## Features

- Upload multiple JPG/PNG images
- Navigate through uploaded images with intuitive controls
- Mark start and end images for sequences
- Support for single image observations
- Extract timestamps from image EXIF data
- Record metadata such as:
- - Camera ID
- - Site location
- - Species identification
- - Observed behaviors
- - Reviewer name
- Save annotations locally during the session
- Sync annotations to Google Sheets

## Requirements

Python 3.7+
Required packages:

- shiny
- shinyswatch
- pandas
- pillow (PIL)
- gspread
- google-auth
- faicons

Install dependencies using:
```bash
pip install -r requirements.txt
```

## Setup

Google Sheets API credentials:

1. Create a service account in Google Cloud Console
- Enable the Google Drive and Google Sheets APIs
- Download the credentials JSON file
- Save it as credentials.json in the same directory as the app
2. Google Sheets:

- The app will create and use a sheet called "Bird monitoring data" to store annotations
- Make sure the service account has permission to create/edit sheets

## Usage

1. Start the app:

```bash
shiny run app.py
```

2. Upload images:

- Click "Browse..." to select images
- Images will be sorted by filename

3. Annotate images:

- Navigate using Previous/Next buttons
- For sequences: Mark start and end images using checkboxes
- For single observations: Use "Single Image Observation" checkbox
- Fill in required metadata fields (Site, Camera, Species, Behavior, Reviewer)

4. Save annotations:

- Click "Save Annotation" to add to the current session table
- View saved annotations in the data table below the image

5. Sync to Google Sheets:

- Click "Sync to Google sheets" when ready to export data
- Data will be appended to the "Bird monitoring data" sheet

## Troubleshooting

- Google Sheets connection issues:

- - Check that credentials.json is present and valid
- - Ensure the service account has proper permissions
- - Verify that necessary Google APIs are enabled
- Image loading issues:

- - Check that image files are valid JPG/PNG formats
- - Large images may take longer to process

- Missing EXIF data:

- - Some images may not contain EXIF timestamp data
- - Manual time entry may be required in these cases

## License

This project is available for research and educational purposes.

