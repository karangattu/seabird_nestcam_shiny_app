import os
from datetime import datetime
from pathlib import Path

import gspread
import pandas as pd
import shinyswatch
from faicons import icon_svg
from google.auth.exceptions import DefaultCredentialsError
from google.oauth2.service_account import Credentials
from PIL import Image
from shiny import App, reactive, render, req, ui
from shiny.types import FileInfo

CAMERAS = [
    "CAM001",
    "CAM002",
    "CAM003",
    "CAM004",
    "CAM005",
    "CAM006",
    "CAM007",
    "CAM008",
]
SITE_LOCATION = [
    "Location 1",
    "Location 2",
    "Location 3",
    "Location 4",
    "Location 5",
    "Location 6",
]
SPECIES = [
    "",
    "Laysan Albatross (Phoebastria immutabilis)",
    "Black-footed Albatross (Phoebastria nigripes)",
    "Wedge-tailed Shearwater (Ardenna pacifica)",
    "Newell's Shearwater (Puffinus newelli)",
    "Hawaiian Petrel (Pterodroma sandwichensis)",
    "Red-tailed Tropicbird (Phaethon rubricauda)",
    "White-tailed Tropicbird (Phaethon lepturus)",
    "Brown Booby (Sula leucogaster)",
    "Red-footed Booby (Sula sula)",
    "Great Frigatebird (Fregata minor)",
    "Rat (Rattus sp.)",
    "Cat (Felis catus)",
    "Mongoose (Herpestes javanicus)",
    "Barn Owl (Tyto alba)",
    "Dog (Canis lupus familiaris)",
    "Goat (Capra hircus)",
    "Deer (Cervidae)",
]
BEHAVIORS = [
    "",
    "Chick rearing",
    "Cleaning",
    "Courtship",
    "Defending territory",
    "Feeding",
    "Flying",
    "Foraging",
    "Incubating",
    "Nesting",
    "Preening",
    "Resting",
]
SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.readonly",
]
CREDENTIALS_FILE = "credentials.json"
ASSIGNMENTS_GOOGLE_SHEET_NAME = "Seabird Camera Assignments"
ANNOTATIONS_GOOGLE_SHEET_NAME = "Bird monitoring data"
ANNOTATION_COLUMNS = [
    "Start Filename",
    "End Filename",
    "Site",
    "Camera",
    "Retrieval Date",
    "Type",
    "Species",
    "Behavior",
    "Sequence Start Time",
    "Sequence End Time",
    "Is Single Image",
    "Reviewer Name",
]


def fetch_google_sheet_data() -> pd.DataFrame | None:
    print("Attempting to fetch Google Sheet data...")
    if not os.path.exists(CREDENTIALS_FILE):
        print(f"Error: Credentials file not found at {CREDENTIALS_FILE}")
        return None
    try:
        creds = Credentials.from_service_account_file(CREDENTIALS_FILE, scopes=SCOPES)
        client = gspread.authorize(creds)
        try:
            sheet = client.open(ASSIGNMENTS_GOOGLE_SHEET_NAME).sheet1
        except gspread.exceptions.SpreadsheetNotFound:
            print(f"Error: Spreadsheet '{ASSIGNMENTS_GOOGLE_SHEET_NAME}' not found...")
            return None
        except gspread.exceptions.APIError as api_err:
            print(
                f"API Error opening sheet '{ASSIGNMENTS_GOOGLE_SHEET_NAME}': {api_err}"
            )
            print("Ensure APIs are enabled and scopes are correct.")
            return None
        except Exception as e:
            print(f"Error opening sheet '{ASSIGNMENTS_GOOGLE_SHEET_NAME}': {e}")
            return None

        data = sheet.get_all_records()
        if not data:
            print(f"Warning: No data found in sheet '{ASSIGNMENTS_GOOGLE_SHEET_NAME}'.")
            # Try to get header even if no data
            try:
                header = sheet.row_values(1)
            except (
                Exception
            ):  # Catch potential errors if sheet is truly empty/inaccessible
                header = []
            return pd.DataFrame(columns=header) if header else pd.DataFrame()

        df = pd.DataFrame(data)
        print(f"Successfully fetched {len(df)} rows from Google Sheet.")
        return df
    except DefaultCredentialsError:
        print("Error: Could not find default credentials...")
        return None
    except Exception as e:
        print(f"An unexpected error occurred while fetching Google Sheet data: {e}")
        return None


def get_image_capture_time(image_path: str) -> str:
    try:
        img = Image.open(image_path)
        exif_time_str = None
        try:
            exif_data = img._getexif()
            if exif_data:
                datetime_original_tag, datetime_tag = 36867, 306
                exif_time_str = exif_data.get(
                    datetime_original_tag, exif_data.get(datetime_tag)
                )
        except (AttributeError, KeyError, IndexError, TypeError) as e:
            print(f"Minor EXIF extraction issue for {Path(image_path).name}: {e}")

        if exif_time_str and isinstance(exif_time_str, str):
            try:
                # Handle potential subsecond precision if present
                exif_time_str_clean = exif_time_str.split(".")[0]
                dt_obj = datetime.strptime(exif_time_str_clean, "%Y:%m:%d %H:%M:%S")
                formatted_time = dt_obj.strftime("%Y-%m-%d %H:%M:%S")
                return formatted_time
            except ValueError as e:
                print(
                    f"EXIF DateTime parsing error for {Path(image_path).name} (Value: '{exif_time_str}'): {e}"
                )
                # Fallback attempt if only time is present (less likely but possible)
                try:
                    time_part = exif_time_str.split(" ")[1].split(".")[0]
                    dt_obj = datetime.strptime(time_part, "%H:%M:%S")
                    current_date = datetime.now().strftime("%Y-%m-%d")
                    formatted_time = f"{current_date} {dt_obj.hour:02d}:{dt_obj.minute:02d}:{dt_obj.second:02d}"
                    return formatted_time
                except (IndexError, ValueError):
                    print(f"Could not parse time part: '{exif_time_str}'")

        print(
            f"Could not extract time for {Path(image_path).name}, falling back to file mod time (approximate)."
        )
        # Fallback to file modification time if EXIF fails
        try:
            mtime = os.path.getmtime(image_path)
            return datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S")
        except Exception as file_time_e:
            print(
                f"Could not get file modification time for {Path(image_path).name}: {file_time_e}"
            )
            return ""  # Final fallback

    except FileNotFoundError:
        print(f"Error: Image file not found at {image_path}")
        return ""
    except Exception as e:
        print(f"Error processing image {Path(image_path).name}: {e}")
        return ""


app_ui = ui.page_fluid(
    ui.panel_title("Seabird Nest Camera Annotation Tool"),
    ui.h3("Camera Assignments Overview"),
    ui.panel_well(ui.output_ui("google_sheet_display_ui")),
    ui.hr(),
    ui.layout_sidebar(
        ui.sidebar(
            ui.h3("Upload Images"),
            ui.p("Select one or more image files."),
            ui.input_file(
                "files",
                "Select images",
                multiple=True,
                accept=[".jpg", ".jpeg", ".png"],
                button_label="Browse...",
                placeholder="No files selected",
            ),
            ui.hr(),
            ui.div(
                ui.h4("Navigate Images"),
                ui.output_text("image_counter"),
                ui.div(
                    ui.input_action_button("prev_img", "← Previous", class_="btn-info"),
                    ui.input_action_button("next_img", "Next →", class_="btn-info"),
                    style="display: flex; justify-content: space-between; margin-top: 10px;",
                ),
            ),
            ui.hr(),
            ui.h4("Sequence Annotation"),
            ui.output_text("current_file_name"),
            ui.div(
                ui.input_checkbox("mark_start", "Mark as Sequence Start"),
                ui.input_checkbox("mark_end", "Mark as Sequence End"),
                style="display: flex; justify-content: space-around; margin-bottom: 15px; background-color: #f0f0f0; padding: 10px; border-radius: 5px;",
            ),
            ui.div(
                ui.input_checkbox(
                    "single_image", "Single Image Observation", value=False
                ),
                style="margin-bottom: 15px; background-color: #e8f4ff; padding: 10px; border-radius: 5px; display: flex; align-items: center; justify-content: center;",
            ),
            ui.output_text("marked_start_display"),
            ui.output_text("marked_end_display"),
            ui.hr(),
            ui.input_select("site", "Site:", SITE_LOCATION),
            ui.input_select("camera", "Camera:", CAMERAS),
            ui.input_date("retrieval_date", "Date of retrieval"),
            ui.input_radio_buttons(
                "predator_or_seabird",
                "Type:",
                choices=["Predator", "Seabird"],
                selected="Seabird",
            ),
            ui.input_select("species", "Species:", SPECIES),
            ui.input_select("behavior", "Behavior:", BEHAVIORS),
            # *** MODIFIED: Changed input_text to input_select ***
            ui.input_select(
                "reviewer_name",
                "Reviewer Name:",
                choices=[],  # Start empty, will be populated dynamically
                selected=None,
            ),
            ui.input_text("start_time", "Sequence Start Time:", ""),
            ui.input_text("end_time", "Sequence End Time:", ""),
            ui.hr(),
            ui.input_action_button(
                "save_sequence",
                "Save Annotation",
                class_="btn-success",
                icon=icon_svg("floppy-disk"),
            ),
            width="400px",
        ),
        ui.output_image("image_display", width="100%", height="auto"),
        ui.hr(),
        ui.h4("Saved Annotations (Current Session)"),
        ui.output_data_frame("annotations_table"),
        ui.div(
            ui.input_action_button(
                "sync",
                "Sync to Google sheets",
                icon=icon_svg("rotate"),
                class_="btn-primary",
                width="250px",
            ),
            ui.input_action_button(
                "clear_data",
                "Clear All Data",
                icon=icon_svg("trash"),
                class_="btn-warning",
                width="150px",
            ),
            style="display: flex; justify-content: space-between; margin-top: 15px;",
        ),
    ),
    theme=shinyswatch.theme.cosmo,
)


def server(input, output, session):

    google_sheet_df = reactive.Value(fetch_google_sheet_data())

    uploaded_file_info = reactive.Value[list[FileInfo]]([])
    current_image_index = reactive.Value(0)
    marked_start_index = reactive.Value[int | None](None)
    marked_end_index = reactive.Value[int | None](None)
    sequence_start_time = reactive.Value("")
    sequence_end_time = reactive.Value("")
    saved_annotations = reactive.Value(pd.DataFrame(columns=ANNOTATION_COLUMNS))
    is_single_image_mode = reactive.Value(False)

    @render.ui
    def google_sheet_display_ui():
        df = google_sheet_df()
        if df is None:
            return ui.p(
                ui.strong("Error:"),
                " Could not load data from Google Sheet.",
                " Check console logs, credentials, API settings, and sheet sharing.",
                style="color: red;",
            )
        elif df.empty:
            # Check if columns exist even if empty
            if "Status" not in df.columns:
                return ui.p(
                    f"No data or expected columns (like 'Status', 'Reviewer') found in Google Sheet '{ASSIGNMENTS_GOOGLE_SHEET_NAME}'."
                )
            else:
                return ui.output_data_frame(
                    "google_sheet_table"
                )  # Render empty table if columns exist but no rows
        else:
            return ui.output_data_frame("google_sheet_table")

    @render.data_frame
    def google_sheet_table():
        df = google_sheet_df.get()
        req(df is not None)  # Ensure df is not None before proceeding
        if not df.empty and "Status" in df.columns:
            completed_indices = df.index[df["Status"] == "Completed"].tolist()
            not_started_indices = df.index[df["Status"] == "Not Started"].tolist()
            in_progress_indices = df.index[df["Status"] == "In Progress"].tolist()
            # Filter out potential NaN or None values before comparison
            status_col = df["Status"].dropna().astype(str)
            completed_indices = df.index[status_col == "Completed"].tolist()
            not_started_indices = df.index[status_col == "Not Started"].tolist()
            in_progress_indices = df.index[status_col == "In Progress"].tolist()
        else:
            completed_indices = []
            not_started_indices = []
            in_progress_indices = []

        # Define styles - adjust column indices if needed based on your sheet
        # Assuming 'Status' is the 3rd column (index 2)
        status_col_index = 2  # Default assumption
        if "Status" in df.columns:
            status_col_index = df.columns.get_loc("Status")

        styles = [
            {
                "cols": [status_col_index],
                "style": {
                    "font-family": "'Fira Sans', 'Segoe UI', Arial, sans-serif",
                    "font-weight": "bold",
                },
            },
            {
                "rows": completed_indices,
                "cols": [status_col_index],
                "style": {"background-color": "#d4edda"},  # light green
            },
            {
                "rows": not_started_indices,
                "cols": [status_col_index],
                "style": {"background-color": "#fff3cd"},  # light yellow
            },
            {
                "rows": in_progress_indices,
                "cols": [status_col_index],
                "style": {"background-color": "#cce5ff"},  # light blue
            },
        ]

        return render.DataGrid(
            df.fillna(""),  # Fill NA for display
            width="100%",
            height="250px",
            styles=styles,
            selection_mode="row",  # Keep row selection if needed for other interactions
        )

    @reactive.Effect
    def _update_reviewer_choices():
        df = google_sheet_df()
        reviewer_choices = [""]  # Start with a blank option
        if df is not None and "Reviewer" in df.columns:
            # Get unique names, remove empty strings/NaNs, sort alphabetically
            unique_names = df["Reviewer"].dropna().astype(str).unique()
            unique_names = sorted([name for name in unique_names if name.strip()])
            reviewer_choices.extend(unique_names)
            print(f"Updating reviewer choices: {reviewer_choices}")
        elif df is None:
            print("Assignments sheet not loaded, cannot update reviewer choices.")
            reviewer_choices = ["Error loading sheet"]
        else:  # df is not None but column is missing
            print("Warning: 'Reviewer Name' column not found in assignments sheet.")
            reviewer_choices = ["'Reviewer Name' column missing"]

        ui.update_select(
            "reviewer_name",
            choices=reviewer_choices,
            selected=None,  # Reset selection when choices update
        )

    @reactive.Effect
    @reactive.event(input.files)
    def _handle_file_upload():
        files = input.files()
        if not files:
            uploaded_file_info.set([])
            current_image_index.set(0)
        else:
            # Sort files by name
            sorted_files = sorted(files, key=lambda f: f["name"])
            uploaded_file_info.set(sorted_files)
            current_image_index.set(0)  # Reset to first image
        _reset_markings()  # Reset markings when new files are loaded
        print("Files uploaded, markings reset.")

    def _reset_markings():
        marked_start_index.set(None)
        marked_end_index.set(None)
        sequence_start_time.set("")
        sequence_end_time.set("")
        is_single_image_mode.set(False)
        # Update UI elements
        ui.update_text("start_time", value="")
        ui.update_text("end_time", value="")
        ui.update_checkbox("mark_start", value=False)
        ui.update_checkbox("mark_end", value=False)
        ui.update_checkbox("single_image", value=False)

    def _reset_all_data():
        # Reset file related state
        uploaded_file_info.set([])
        current_image_index.set(0)
        # Reset markings and annotation state
        _reset_markings()
        saved_annotations.set(pd.DataFrame(columns=ANNOTATION_COLUMNS))
        # Reset form inputs (add others if necessary)
        # *** MODIFIED: Reset reviewer_name select input ***
        ui.update_select("reviewer_name", selected=None)
        # Optionally reset other selects/inputs if desired
        # ui.update_select("site", selected=SITE_LOCATION[0])
        # ui.update_select("camera", selected=CAMERAS[0])
        # ui.update_date("retrieval_date", value=datetime.now().date()) # Or None
        # ui.update_radio_buttons("predator_or_seabird", selected="Seabird")
        # ui.update_select("species", selected="")
        # ui.update_select("behavior", selected="")

        ui.notification_show(
            "Data cleared. Select new files if needed.", type="message", duration=4
        )
        print("All local data cleared.")

    @reactive.Effect
    @reactive.event(input.next_img)
    def _go_to_next_image():
        current_idx = current_image_index()
        max_idx = len(uploaded_file_info()) - 1
        if current_idx < max_idx:
            current_image_index.set(current_idx + 1)

    @reactive.Effect
    @reactive.event(input.prev_img)
    def _go_to_previous_image():
        current_idx = current_image_index()
        if current_idx > 0:
            current_image_index.set(current_idx - 1)

    @render.text
    def image_counter():
        count = len(uploaded_file_info())
        idx = current_image_index()
        return f"Image {idx + 1} of {count}" if count > 0 else "Image 0 of 0"

    @render.text
    def current_file_name():
        files = uploaded_file_info()
        idx = current_image_index()
        req(files and 0 <= idx < len(files))
        return f"Current file: {files[idx]['name']}"

    @render.image
    def image_display():
        files = uploaded_file_info()
        idx = current_image_index()
        req(files and 0 <= idx < len(files))
        current_file: FileInfo = files[idx]
        img_src = current_file["datapath"]
        # Ensure the image path is valid before returning
        if not os.path.exists(img_src):
            print(f"Error: Image path does not exist: {img_src}")
            # Optionally return a placeholder or error message
            return {"src": "", "alt": "Error loading image"}
        return {
            "src": img_src,
            "width": "100%",
            "height": "auto",
            "alt": f"Image: {current_file['name']}",
        }

    @reactive.Effect
    @reactive.event(input.single_image)
    def _handle_single_image_mode():
        files = uploaded_file_info()
        idx = current_image_index()
        req(files and 0 <= idx < len(files))

        is_single = input.single_image()
        is_single_image_mode.set(is_single)

        if is_single:
            current_file: FileInfo = files[idx]
            image_path = current_file["datapath"]
            extracted_time = get_image_capture_time(image_path)

            marked_start_index.set(idx)
            marked_end_index.set(idx)
            sequence_start_time.set(extracted_time)
            sequence_end_time.set(extracted_time)

            # Update UI
            ui.update_text("start_time", value=extracted_time)
            ui.update_text("end_time", value=extracted_time)
            ui.update_checkbox("mark_start", value=True)
            ui.update_checkbox("mark_end", value=True)

            ui.notification_show(
                "Single image mode: This image will be annotated as both start and end.",
                type="message",
                duration=4,
            )
            print(f"Single Image Mode Activated: Index {idx}, Time {extracted_time}")
        else:
            # When turning off single image mode, reset markings related to the current image *if* it was marked
            was_start = marked_start_index.get() == idx
            was_end = marked_end_index.get() == idx

            # Only reset if both were set by single image mode for the current image
            if was_start and was_end:
                _reset_markings()  # Full reset might be simplest
                print("Single Image Mode Deactivated - Markings reset")
            else:
                # If only one was marked, keep it marked but disable single mode flag
                print(
                    "Single Image Mode Deactivated - Keeping existing independent marks"
                )
                # Ensure checkboxes reflect actual state if user unmarked one manually before toggling single off
                ui.update_checkbox("mark_start", value=marked_start_index.get() == idx)
                ui.update_checkbox("mark_end", value=marked_end_index.get() == idx)

    @reactive.Effect
    @reactive.event(input.mark_start)
    def _handle_mark_start():
        if is_single_image_mode():  # Ignore manual marking if single image mode is on
            ui.update_checkbox("mark_start", value=True)  # Keep it checked visually
            return

        files = uploaded_file_info()
        idx = current_image_index()
        req(files and 0 <= idx < len(files))

        if input.mark_start():  # If checkbox is checked
            current_file: FileInfo = files[idx]
            image_path = current_file["datapath"]
            extracted_time = get_image_capture_time(image_path)

            # Prevent marking same image as start and end unless in single mode (checked above)
            if marked_end_index.get() == idx:
                ui.notification_show(
                    "Cannot mark the same image as both start and end unless using 'Single Image Observation'.",
                    type="warning",
                    duration=4,
                )
                ui.update_checkbox("mark_start", value=False)  # Revert checkbox
                return

            marked_start_index.set(idx)
            sequence_start_time.set(extracted_time)
            ui.update_text("start_time", value=extracted_time)
            print(f"Marked Start: Index {idx}, Time {extracted_time}")
        else:  # If checkbox is unchecked
            # Only unmark if the current image *was* the marked start image
            if marked_start_index.get() == idx:
                marked_start_index.set(None)
                sequence_start_time.set("")
                ui.update_text("start_time", value="")
                print(f"Unmarked Start: Index {idx}")

    @reactive.Effect
    @reactive.event(input.mark_end)
    def _handle_mark_end():
        if is_single_image_mode():  # Ignore manual marking if single image mode is on
            ui.update_checkbox("mark_end", value=True)  # Keep it checked visually
            return

        files = uploaded_file_info()
        idx = current_image_index()
        req(files and 0 <= idx < len(files))

        if input.mark_end():  # If checkbox is checked
            current_file: FileInfo = files[idx]
            image_path = current_file["datapath"]
            extracted_time = get_image_capture_time(image_path)

            # Prevent marking same image as start and end unless in single mode (checked above)
            if marked_start_index.get() == idx:
                ui.notification_show(
                    "Cannot mark the same image as both start and end unless using 'Single Image Observation'.",
                    type="warning",
                    duration=4,
                )
                ui.update_checkbox("mark_end", value=False)  # Revert checkbox
                return

            marked_end_index.set(idx)
            sequence_end_time.set(extracted_time)
            ui.update_text("end_time", value=extracted_time)
            print(f"Marked End: Index {idx}, Time {extracted_time}")
        else:  # If checkbox is unchecked
            # Only unmark if the current image *was* the marked end image
            if marked_end_index.get() == idx:
                marked_end_index.set(None)
                sequence_end_time.set("")
                ui.update_text("end_time", value="")
                print(f"Unmarked End: Index {idx}")

    @reactive.Effect
    def _update_checkbox_states_on_nav():
        """Ensure checkboxes match the marking state when navigating between images."""
        idx = current_image_index()
        start_idx = marked_start_index()
        end_idx = marked_end_index()
        single_mode = is_single_image_mode()

        # Update single image checkbox first
        is_marked_as_single = single_mode and start_idx == idx and end_idx == idx
        ui.update_checkbox("single_image", value=is_marked_as_single)

        # Update start/end checkboxes based on current index and marked indices
        # These should reflect the state *regardless* of single_mode,
        # but the _handle_mark_start/end functions prevent manual changes *if* single_mode is active.
        ui.update_checkbox(
            "mark_start", value=(start_idx is not None and start_idx == idx)
        )
        ui.update_checkbox("mark_end", value=(end_idx is not None and end_idx == idx))

    @render.text
    def marked_start_display():
        files = uploaded_file_info()
        start_idx = marked_start_index()
        if start_idx is not None and 0 <= start_idx < len(files):
            return f"Start Image Marked: {files[start_idx]['name']}"
        else:
            # If index is invalid (e.g., files changed), reset it
            if start_idx is not None:
                marked_start_index.set(None)
            return "Start Image Marked: None"

    @render.text
    def marked_end_display():
        files = uploaded_file_info()
        end_idx = marked_end_index()
        if end_idx is not None and 0 <= end_idx < len(files):
            start_idx = marked_start_index()  # Check start index for ordering warning
            display_text = f"End Image Marked: {files[end_idx]['name']}"
            # Add warning if end is before start (and not single image mode)
            if (
                not is_single_image_mode()
                and start_idx is not None
                and end_idx < start_idx
            ):
                display_text += " - <strong style='color:orange;'>Warning: Occurs before start image!</strong>"
            return ui.HTML(display_text)  # Use HTML for formatting
        else:
            # If index is invalid (e.g., files changed), reset it
            if end_idx is not None:
                marked_end_index.set(None)
            return "End Image Marked: None"

    @reactive.Effect
    @reactive.event(input.save_sequence)
    def _save_sequence():
        files = uploaded_file_info()
        start_idx = marked_start_index()
        end_idx = marked_end_index()
        single_mode = is_single_image_mode()

        if start_idx is None or end_idx is None:
            ui.notification_show(
                "Please mark both a start and an end image.", type="error", duration=5
            )
            return
        if not (0 <= start_idx < len(files) and 0 <= end_idx < len(files)):
            ui.notification_show(
                "Marked image data is outdated. Please re-mark start/end.",
                type="error",
                duration=6,
            )
            _reset_markings()
            return
        if not single_mode and end_idx < start_idx:
            ui.notification_show(
                "Sequence End image cannot be before the Start image.",
                type="error",
                duration=5,
            )
            return

        # Check required fields
        # *** MODIFIED: Check if reviewer_name is selected (not empty string) ***
        req_fields = {
            "Site": input.site(),
            "Camera": input.camera(),
            "Type": input.predator_or_seabird(),
            "Species": input.species(),
            "Behavior": input.behavior(),
            "Reviewer Name": input.reviewer_name(),  # Gets value from input_select
        }
        missing = [
            name for name, val in req_fields.items() if not val
        ]  # Check for empty strings or None

        if missing:
            ui.notification_show(
                f"Please fill in required fields: {', '.join(missing)}.",
                type="warning",
                duration=5,
            )
            return
        # Start/End time should be available if start/end are marked
        if not sequence_start_time():
            ui.notification_show(
                "Could not determine sequence start time. Please re-mark start image.",
                type="warning",
                duration=5,
            )
            return
        # End time might be same as start in single mode, or empty if not extracted properly
        # It's less critical to validate strictly here as it's derived
        # req(sequence_end_time(), cancel_output=False)

        start_filename = files[start_idx]["name"]
        end_filename = files[end_idx]["name"]
        start_t = sequence_start_time()
        # Use start time for end time if single mode or if end time failed extraction
        end_t = sequence_end_time() if sequence_end_time() else start_t

        retrieval_dt = input.retrieval_date()
        formatted_date = retrieval_dt.strftime("%Y-%m-%d") if retrieval_dt else ""

        new_sequence = pd.DataFrame(
            {
                "Start Filename": [start_filename],
                "End Filename": [end_filename],
                "Site": [input.site()],
                "Camera": [input.camera()],
                "Retrieval Date": [formatted_date],
                "Type": [input.predator_or_seabird()],
                "Species": [input.species()],
                "Behavior": [input.behavior()],
                "Sequence Start Time": [start_t],
                "Sequence End Time": [end_t],
                "Is Single Image": [single_mode],
                "Reviewer Name": [input.reviewer_name()],  # Use selected value
            },
            columns=ANNOTATION_COLUMNS,
        )

        current_df = saved_annotations()
        updated_df = pd.concat([current_df, new_sequence], ignore_index=True)
        saved_annotations.set(updated_df)

        if single_mode:
            ui.notification_show(
                f"Single image annotation saved: {start_filename}",
                duration=4,
                type="message",
            )
            print(f"Saved single image annotation: {start_filename}")
        else:
            ui.notification_show(
                f"Sequence saved: {start_filename} to {end_filename}",
                duration=4,
                type="message",
            )
            print(f"Saved sequence: {start_filename} -> {end_filename}")

        _reset_markings()  # Clear markings for next sequence

    @render.data_frame
    def annotations_table():
        df_to_render = saved_annotations.get()
        # Prepare dataframe for display if not empty
        if not df_to_render.empty:
            # Create display copy
            display_df = df_to_render.copy()

            # Add Annotation Type column based on 'Is Single Image'
            if "Is Single Image" in display_df.columns:
                display_df["Annotation Type"] = display_df["Is Single Image"].apply(
                    lambda x: "Single Image Observation" if x else "Image Sequence"
                )
            else:
                display_df["Annotation Type"] = (
                    "Image Sequence"  # Default if column missing
                )

            # Define desired column order, putting Annotation Type first
            display_cols_order = ["Annotation Type"] + [
                col for col in ANNOTATION_COLUMNS if col != "Is Single Image"
            ]
            # Ensure all expected columns exist in display_df before reordering
            final_cols = [
                col for col in display_cols_order if col in display_df.columns
            ]
            display_df = display_df[final_cols]

            return render.DataGrid(
                display_df.fillna(""),  # Fill NA for display
                selection_mode="none",
                width="100%",
                height="300px",
            )
        else:
            # Return an empty DataGrid if no annotations saved yet
            return render.DataGrid(
                pd.DataFrame(
                    columns=["Annotation Type"]
                    + [col for col in ANNOTATION_COLUMNS if col != "Is Single Image"]
                ),
                selection_mode="none",
                width="100%",
                height="300px",
            )

    @reactive.Effect
    def _update_button_states():
        idx = current_image_index()
        count = len(uploaded_file_info())
        start_marked = marked_start_index() is not None
        end_marked = marked_end_index() is not None
        # single_mode = is_single_image_mode() # We don't need this variable here anymore for disabling checkboxes

        # Navigation buttons
        ui.update_action_button("prev_img", disabled=(count == 0 or idx == 0))
        ui.update_action_button("next_img", disabled=(count == 0 or idx >= count - 1))

        # Save button: enabled if images loaded AND start/end are marked
        save_enabled = count > 0 and start_marked and end_marked
        ui.update_action_button("save_sequence", disabled=not save_enabled)

        # Sync button: enabled if there are saved annotations
        ui.update_action_button("sync", disabled=saved_annotations().empty)

        # Clear button: enabled if there are uploaded files OR saved annotations
        has_data = not saved_annotations().empty or len(uploaded_file_info()) > 0
        ui.update_action_button("clear_data", disabled=not has_data)

    @reactive.Effect
    @reactive.event(input.clear_data)
    def _handle_clear_data():
        _reset_all_data()
        ui.notification_show(
            "All local data has been cleared", type="message", duration=3
        )

    @reactive.Effect
    @reactive.event(input.sync)
    def _sync_to_google_sheets():
        # Display immediate feedback
        sync_notification_id = ui.notification_show(
            "Syncing started...", duration=None, type="message", close_button=False
        )
        print("Sync button clicked. Attempting to sync...")

        df_to_sync = saved_annotations()

        if df_to_sync.empty:
            ui.notification_remove(sync_notification_id)  # Remove progress notification
            ui.notification_show("No annotations to sync.", duration=3, type="warning")
            print("Sync aborted: No data.")
            return

        try:
            # --- 1. Authorization ---
            if not os.path.exists(CREDENTIALS_FILE):
                raise FileNotFoundError(
                    f"Credentials file not found at {CREDENTIALS_FILE}"
                )
            creds = Credentials.from_service_account_file(
                CREDENTIALS_FILE, scopes=SCOPES
            )
            client = gspread.authorize(creds)

            # --- 2. Open or Create Sheet ---
            try:
                spreadsheet = client.open(ANNOTATIONS_GOOGLE_SHEET_NAME)
                sheet = spreadsheet.sheet1
                print(f"Opened existing sheet: {ANNOTATIONS_GOOGLE_SHEET_NAME}")
            except gspread.exceptions.SpreadsheetNotFound:
                print(f"Sheet '{ANNOTATIONS_GOOGLE_SHEET_NAME}' not found, creating...")
                spreadsheet = client.create(ANNOTATIONS_GOOGLE_SHEET_NAME)
                sheet = spreadsheet.sheet1
                print(f"Created new sheet: {ANNOTATIONS_GOOGLE_SHEET_NAME}")
                # Optional: Share - be careful with permissions
                # spreadsheet.share(None, perm_type="anyone", role="writer") # Or 'reader'
                # print(f"Sheet sharing updated.")
            except gspread.exceptions.APIError as api_err:
                # Catch API errors during open/create specifically
                raise api_err  # Re-raise to be caught by the main exception block

            # --- 3. Handle Headers and Append Data ---
            existing_data = sheet.get_all_values()
            expected_headers = (
                df_to_sync.columns.tolist()
            )  # Use columns from the DataFrame being synced

            if not existing_data:  # Sheet is completely empty
                print("Sheet is empty. Writing headers and data.")
                headers = expected_headers
                data_to_write = df_to_sync.fillna("").values.tolist()
                all_rows = [headers] + data_to_write
                sheet.update(all_rows, value_input_option="USER_ENTERED")
                print(f"Wrote headers and {len(data_to_write)} rows.")
            else:  # Sheet has existing data
                existing_headers = existing_data[0]
                if (
                    not existing_headers
                ):  # Has rows but no header row (unlikely but possible)
                    print("Sheet has data but no header row. Inserting headers.")
                    sheet.insert_row(
                        expected_headers, 1, value_input_option="USER_ENTERED"
                    )
                    data_to_append = df_to_sync.fillna("").values.tolist()
                    sheet.append_rows(data_to_append, value_input_option="USER_ENTERED")
                    print(
                        f"Appended {len(data_to_append)} rows after inserting headers."
                    )
                elif set(existing_headers) == set(
                    expected_headers
                ):  # Headers match (order doesn't matter for append)
                    print("Headers match. Appending data.")
                    # Ensure data being appended matches the *order* of existing headers
                    df_reordered = df_to_sync[existing_headers]
                    data_to_append = df_reordered.fillna("").values.tolist()
                    sheet.append_rows(data_to_append, value_input_option="USER_ENTERED")
                    print(f"Appended {len(data_to_append)} rows.")
                else:  # Header mismatch
                    print("Warning: Header mismatch between app data and Google Sheet.")
                    print(f"  Sheet Headers: {existing_headers}")
                    print(f"  App Headers:   {expected_headers}")
                    # Attempt to sync only common columns
                    common_headers = [
                        h for h in existing_headers if h in expected_headers
                    ]
                    missing_in_sheet = [
                        h for h in expected_headers if h not in existing_headers
                    ]
                    extra_in_sheet = [
                        h for h in existing_headers if h not in expected_headers
                    ]

                    if not common_headers:
                        raise ValueError(
                            "Cannot sync: No matching columns found between app data and Google Sheet."
                        )

                    print(f"Syncing common columns: {common_headers}")
                    if missing_in_sheet:
                        print(
                            f"Columns not in sheet (will not be synced): {missing_in_sheet}"
                        )
                    if extra_in_sheet:
                        print(f"Extra columns found in sheet: {extra_in_sheet}")

                    df_common = df_to_sync[common_headers]
                    data_to_append = df_common.fillna("").values.tolist()
                    sheet.append_rows(data_to_append, value_input_option="USER_ENTERED")
                    print(
                        f"Appended {len(data_to_append)} rows with {len(common_headers)} common columns."
                    )
                    # Show a more persistent warning about mismatch
                    ui.notification_remove(sync_notification_id)  # Remove progress
                    ui.notification_show(
                        f"Sync completed, but headers mismatched. Only common columns ({len(common_headers)}) synced. Check sheet and app columns.",
                        duration=10,
                        type="warning",
                    )
                    _reset_all_data()  # Still reset local data after partial sync
                    return  # Exit after handling mismatch

            # --- 4. Success Feedback and Reset ---
            annotation_count = len(df_to_sync)
            ui.notification_remove(sync_notification_id)  # Remove progress
            ui.notification_show(
                f"Successfully synced {annotation_count} annotations! Data cleared.",
                duration=5,
                type="message",
            )
            print("Sync successful, local data cleared.")
            _reset_all_data()  # Clear local data after successful sync

        # --- Error Handling ---
        except FileNotFoundError as e:
            print(f"Sync Error: {e}")
            ui.notification_remove(sync_notification_id)
            ui.notification_show(
                f"Sync failed: Credentials file missing at '{CREDENTIALS_FILE}'.",
                duration=7,
                type="error",
            )
        except gspread.exceptions.APIError as e:
            print(f"Sync Error: Google API error - {e}")
            ui.notification_remove(sync_notification_id)
            ui.notification_show(
                f"Sync failed: Google API Error. Check sheet permissions, API quotas, and scopes.",
                duration=7,
                type="error",
            )
        except ValueError as e:  # Catch specific errors like column mismatch failure
            print(f"Sync Error: {e}")
            ui.notification_remove(sync_notification_id)
            ui.notification_show(f"Sync failed: {e}", duration=7, type="error")
        except Exception as e:
            print(
                f"Sync Error: An unexpected error occurred - {e}", exc_info=True
            )  # Log traceback
            ui.notification_remove(sync_notification_id)
            ui.notification_show(
                f"Sync failed: Unexpected error - Check console logs.",
                duration=7,
                type="error",
            )


app = App(app_ui, server)
