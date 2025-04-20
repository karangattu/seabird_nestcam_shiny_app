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
    # Seabirds
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
    # Predators/Mammals
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

# --- Google Sheet Configuration ---
SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",  # Need write scope for syncing later
    "https://www.googleapis.com/auth/drive.readonly",
]
CREDENTIALS_FILE = "credentials.json"
ASSIGNMENTS_GOOGLE_SHEET_NAME = "Seabird Camera Assignments"
ANNOTATIONS_GOOGLE_SHEET_NAME = (
    "Bird monitoring data"
)

# --- Define Columns for Saved Annotations ---
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
    "Is Single Image",  # New column to track single image annotations
    "Reviewer Name",  # New column for reviewer name
]


def fetch_google_sheet_data() -> pd.DataFrame | None:
    """
    Fetches data from the specified Google Sheet using service account credentials.
    Returns a pandas DataFrame or None if an error occurs.
    """
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
            header = sheet.row_values(1)
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


# --- Helper Function to Get Image Capture Time ---
def get_image_capture_time(image_path: str) -> str:
    """
    Extracts capture time (HH:MM) from image EXIF data.
    Returns empty string if time cannot be extracted.
    """
    try:
        img = Image.open(image_path)
        exif_time_str = None
        try:
            exif_data = img._getexif()  # Use _getexif() for potential safety
            if exif_data:
                # Common tags for DateTimeOriginal and DateTime
                datetime_original_tag, datetime_tag = 36867, 306
                exif_time_str = exif_data.get(
                    datetime_original_tag, exif_data.get(datetime_tag)
                )
        except (AttributeError, KeyError, IndexError, TypeError) as e:
            print(
                f"Minor EXIF extraction issue for {Path(image_path).name}: {e}"
            )  # Less alarming log

        if exif_time_str and isinstance(exif_time_str, str):
            try:
                # Handle potential fractional seconds or timezone info if present
                dt_obj = datetime.strptime(
                    exif_time_str.split(".")[0], "%Y:%m:%d %H:%M:%S"
                )
                formatted_time = f"{dt_obj.hour:02d}:{dt_obj.minute:02d}"
                # print(f"Extracted time {formatted_time} for {Path(image_path).name}")
                return formatted_time
            except ValueError as e:
                print(
                    f"EXIF DateTime parsing error for {Path(image_path).name} (Value: '{exif_time_str}'): {e}"
                )
                # Attempt alternative format if the primary one fails
                try:
                    dt_obj = datetime.strptime(
                        exif_time_str.split(" ")[1], "%H:%M:%S"
                    )  # Just time part
                    formatted_time = f"{dt_obj.hour:02d}:{dt_obj.minute:02d}"
                    return formatted_time
                except ValueError:
                    pass  # Give up if secondary parse fails

    except FileNotFoundError:
        print(f"Error: Image file not found at {image_path}")
    except Exception as e:
        print(f"Error processing image {Path(image_path).name}: {e}")

    print(f"Could not extract time for {Path(image_path).name}")
    return ""  # Return empty string on any failure


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
            # --- Sequence Marking ---
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
            ui.hr(),  # Separator
            # --- Metadata Inputs ---
            ui.input_select("site", "Site:", SITE_LOCATION),
            ui.input_select("camera", "Camera:", CAMERAS),
            ui.input_date("retrieval_date", "Date of retrieval"),
            ui.input_radio_buttons(
                "predator_or_seabird",
                "Type:",
                choices=["Predator", "Seabird"],
                selected="Seabird",  # Default to Seabird
            ),
            ui.input_select("species", "Species:", SPECIES),
            ui.input_select("behavior", "Behavior:", BEHAVIORS),
            # --- New input for reviewer name ---
            ui.input_text("reviewer_name", "Reviewer Name:", ""),
            # --- Time Inputs (Read-only Text Boxes) ---
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
        # --- Main Content Panel ---
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


# --- Server Logic ---
def server(input, output, session):

    # --- Google Sheet Data ---
    google_sheet_df = reactive.Value(fetch_google_sheet_data())

    # --- Reactive Values for Application State ---
    uploaded_file_info = reactive.Value[list[FileInfo]]([])
    current_image_index = reactive.Value(0)
    # Store index of marked images (-1 or None indicates not set)
    marked_start_index = reactive.Value[int | None](None)
    marked_end_index = reactive.Value[int | None](None)
    # Store the extracted times for the sequence
    sequence_start_time = reactive.Value("")
    sequence_end_time = reactive.Value("")
    # DataFrame for saved sequences
    saved_annotations = reactive.Value(pd.DataFrame(columns=ANNOTATION_COLUMNS))
    # Single image mode
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
            return ui.p(
                f"No data found in Google Sheet '{ASSIGNMENTS_GOOGLE_SHEET_NAME}'."
            )
        else:
            return ui.output_data_frame("google_sheet_table")

    @render.data_frame
    def google_sheet_table():
        df = google_sheet_df.get()  # Use get() for clarity
        req(df is not None)
        return render.DataGrid(df, width="100%", height="250px")  # Adjusted height

    # --- Handle File Upload ---
    @reactive.Effect
    @reactive.event(input.files)
    def _handle_file_upload():
        files = input.files()
        if not files:
            uploaded_file_info.set([])
            current_image_index.set(0)
        else:
            # Sort files by name (often corresponds to time)
            sorted_files = sorted(files, key=lambda f: f["name"])
            uploaded_file_info.set(sorted_files)
            current_image_index.set(0)

        # Reset markings whenever files change
        _reset_markings()
        print("Files uploaded, markings reset.")

    # --- Reset Markings Helper ---
    def _reset_markings():
        marked_start_index.set(None)
        marked_end_index.set(None)
        sequence_start_time.set("")
        sequence_end_time.set("")
        is_single_image_mode.set(False)
        # Explicitly update UI elements that depend on markings
        ui.update_text("start_time", value="")
        ui.update_text("end_time", value="")
        ui.update_checkbox("mark_start", value=False)
        ui.update_checkbox("mark_end", value=False)
        ui.update_checkbox("single_image", value=False)

    def _reset_all_data():
        # Reset all state
        uploaded_file_info.set([])
        current_image_index.set(0)
        _reset_markings()
        saved_annotations.set(pd.DataFrame(columns=ANNOTATION_COLUMNS))

        # Reset reviewer name
        ui.update_text("reviewer_name", value="")

        # Inform user to select new files if needed
        ui.notification_show(
            "Data cleared. Select new files if needed.", type="message", duration=4
        )

    # --- Image Navigation ---
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

    # --- Display Image Counter ---
    @render.text
    def image_counter():
        count = len(uploaded_file_info())
        idx = current_image_index()
        return f"Image {idx + 1} of {count}" if count > 0 else "Image 0 of 0"

    # --- Display Current Filename ---
    @render.text
    def current_file_name():
        files = uploaded_file_info()
        idx = current_image_index()
        req(files and 0 <= idx < len(files))
        return f"Current file: {files[idx]['name']}"

    # --- Display Image ---
    @render.image
    def image_display():
        files = uploaded_file_info()
        idx = current_image_index()
        req(files and 0 <= idx < len(files))
        current_file: FileInfo = files[idx]
        img_src = current_file["datapath"]
        return {
            "src": img_src,
            "width": "100%",
            "height": "auto",
            "alt": f"Image: {current_file['name']}",
        }

    # --- Handle Single Image Checkbox ---
    @reactive.Effect
    @reactive.event(input.single_image)
    def _handle_single_image_mode():
        files = uploaded_file_info()
        idx = current_image_index()
        req(files and 0 <= idx < len(files))  # Ensure valid context

        is_single = input.single_image()
        is_single_image_mode.set(is_single)

        if is_single:
            # When enabling single image mode, set both start and end to current
            current_file: FileInfo = files[idx]
            image_path = current_file["datapath"]
            extracted_time = get_image_capture_time(image_path)

            # Mark current image as both start and end
            marked_start_index.set(idx)
            marked_end_index.set(idx)

            # Set the same time for both start and end
            sequence_start_time.set(extracted_time)
            sequence_end_time.set(extracted_time)

            # Update UI elements
            ui.update_text("start_time", value=extracted_time)
            ui.update_text("end_time", value=extracted_time)
            ui.update_checkbox("mark_start", value=True)
            ui.update_checkbox("mark_end", value=True)

            # Notification for user clarity
            ui.notification_show(
                "Single image mode: This image will be annotated as both start and end.",
                type="message",
                duration=4,
            )
            print(f"Single Image Mode Activated: Index {idx}, Time {extracted_time}")
        else:
            # Reset markings when disabling single image mode
            _reset_markings()
            print("Single Image Mode Deactivated")

    # --- Handle "Mark as Start" Checkbox ---
    @reactive.Effect
    @reactive.event(input.mark_start)
    def _handle_mark_start():
        # Skip this effect if in single image mode
        if is_single_image_mode():
            return

        files = uploaded_file_info()
        idx = current_image_index()
        req(files and 0 <= idx < len(files))  # Ensure valid context

        if input.mark_start():  # If checked
            current_file: FileInfo = files[idx]
            image_path = current_file["datapath"]
            extracted_time = get_image_capture_time(image_path)

            # Check if this image is already marked as end
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
        else:  # If unchecked
            # Only clear if the *currently stored* start index matches the current image index
            if marked_start_index.get() == idx:
                marked_start_index.set(None)
                sequence_start_time.set("")
                ui.update_text("start_time", value="")
                print(f"Unmarked Start: Index {idx}")

    # --- Handle "Mark as End" Checkbox ---
    @reactive.Effect
    @reactive.event(input.mark_end)
    def _handle_mark_end():
        # Skip this effect if in single image mode
        if is_single_image_mode():
            return

        files = uploaded_file_info()
        idx = current_image_index()
        req(files and 0 <= idx < len(files))  # Ensure valid context

        if input.mark_end():  # If checked
            current_file: FileInfo = files[idx]
            image_path = current_file["datapath"]
            extracted_time = get_image_capture_time(image_path)

            # Check if this image is already marked as start
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
        else:  # If unchecked
            # Only clear if the *currently stored* end index matches the current image index
            if marked_end_index.get() == idx:
                marked_end_index.set(None)
                sequence_end_time.set("")
                ui.update_text("end_time", value="")
                print(f"Unmarked End: Index {idx}")

    # --- Update Checkbox State on Navigation ---
    @reactive.Effect
    def _update_checkbox_states_on_nav():
        # This effect runs whenever the current index or marked indices change
        idx = current_image_index()
        start_idx = marked_start_index()
        end_idx = marked_end_index()
        single_mode = is_single_image_mode()

        # Don't update checkboxes in single image mode when navigating
        if not single_mode:
            # Update mark_start checkbox
            is_start_marked = start_idx is not None and start_idx == idx
            ui.update_checkbox("mark_start", value=is_start_marked)

            # Update mark_end checkbox
            is_end_marked = end_idx is not None and end_idx == idx
            ui.update_checkbox("mark_end", value=is_end_marked)

            # Update single_image checkbox - TRUE if start and end are the same and current
            is_single_image = (
                start_idx is not None
                and end_idx is not None
                and start_idx == end_idx == idx
            )
            ui.update_checkbox("single_image", value=is_single_image)

    # --- Display Marked Filenames ---
    @render.text
    def marked_start_display():
        files = uploaded_file_info()
        start_idx = marked_start_index()
        if start_idx is not None and 0 <= start_idx < len(files):
            return f"Start Image Marked: {files[start_idx]['name']}"
        else:
            # Reset if index becomes invalid (e.g., after new upload)
            if start_idx is not None:
                marked_start_index.set(None)
            return "Start Image Marked: None"

    @render.text
    def marked_end_display():
        files = uploaded_file_info()
        end_idx = marked_end_index()
        if end_idx is not None and 0 <= end_idx < len(files):
            # Add check: End time should not be before start time if both are marked
            start_idx = marked_start_index()

            # Don't show warning in single image mode
            if is_single_image_mode():
                return f"End Image Marked: {files[end_idx]['name']}"

            if start_idx is not None and end_idx < start_idx:
                return f"End Image Marked: {files[end_idx]['name']} - <strong style='color:orange;'>Warning: Occurs before start image!</strong>"
            else:
                return f"End Image Marked: {files[end_idx]['name']}"
        else:
            if end_idx is not None:
                marked_end_index.set(None)
            return "End Image Marked: None"

    # --- Save Sequence Logic ---
    @reactive.Effect
    @reactive.event(input.save_sequence)
    def _save_sequence():
        files = uploaded_file_info()
        start_idx = marked_start_index()
        end_idx = marked_end_index()
        single_mode = is_single_image_mode()

        # --- Validation ---
        if start_idx is None or end_idx is None:
            ui.notification_show(
                "Please mark both a start and an end image for the sequence.",
                type="error",
                duration=5,
            )
            return

        # Ensure indices are still valid (might change if files are re-uploaded)
        if not (0 <= start_idx < len(files) and 0 <= end_idx < len(files)):
            ui.notification_show(
                "Marked image data is outdated (files might have changed). Please re-mark start/end.",
                type="error",
                duration=6,
            )
            _reset_markings()
            return

        # Check logical order of start/end indices if not in single image mode
        if not single_mode and end_idx < start_idx:
            ui.notification_show(
                "Sequence End image cannot be before the Start image.",
                type="error",
                duration=5,
            )
            return

        # Validate required metadata fields
        req(
            input.site(), cancel_output=False
        )  # cancel_output=False shows notification instead of silent fail
        req(input.camera(), cancel_output=False)
        req(input.reviewer_name(), cancel_output=False)  # Require reviewer name
        # date has default
        req(input.predator_or_seabird(), cancel_output=False)
        req(input.species(), cancel_output=False)
        req(input.behavior(), cancel_output=False)
        # Times are derived, but check they aren't empty if indices are set
        req(sequence_start_time(), cancel_output=False)

        # If any req fails, show a generic message (specific ones handled by req)
        if not all(
            [
                input.site(),
                input.camera(),
                input.predator_or_seabird(),
                input.species(),
                input.behavior(),
                input.reviewer_name(),  # Check reviewer name
                sequence_start_time(),
            ]
        ):
            ui.notification_show(
                "Please fill in all annotation details (Site, Camera, Type, Species, Behavior, Reviewer Name).",
                type="warning",
                duration=5,
            )
            return

        # --- Data Collection ---
        start_filename = files[start_idx]["name"]
        end_filename = files[end_idx]["name"]
        start_t = sequence_start_time()
        end_t = sequence_end_time()  # Use stored time

        # Format date correctly
        retrieval_dt = input.retrieval_date()
        formatted_date = retrieval_dt.strftime("%Y-%m-%d") if retrieval_dt else ""

        # --- Create DataFrame Row ---
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
                "Is Single Image": [
                    single_mode
                ],  # Track if this is a single image annotation
                "Reviewer Name": [input.reviewer_name()],  # Add reviewer name
            },
            columns=ANNOTATION_COLUMNS,  # Ensure correct order
        )

        # --- Append to Saved Annotations ---
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

        # --- Reset Markings and Time fields after successful save ---
        _reset_markings()

    # --- Display Saved Annotations Table ---
    @render.data_frame
    def annotations_table():
        # Use .get() to ensure reactive dependency
        df_to_render = saved_annotations.get()

        # Format the display to show single image annotations more clearly
        if not df_to_render.empty and "Is Single Image" in df_to_render.columns:
            # Add a column that formats the description based on whether it's a single image
            display_cols = ANNOTATION_COLUMNS.copy()
            if "Is Single Image" in display_cols:
                display_cols.remove("Is Single Image")  # Don't display this raw column

            # Format rows to highlight single image observations
            df_to_render = df_to_render.copy()  # Copy to avoid modification warning
            df_to_render["Annotation Type"] = df_to_render["Is Single Image"].apply(
                lambda x: "Single Image Observation" if x else "Image Sequence"
            )

            # Reorder columns for better display - put reviewer at beginning
            final_cols = ["Annotation Type", "Reviewer Name"] + [
                col for col in display_cols if col != "Reviewer Name"
            ]
            df_to_render = df_to_render[final_cols]

        return render.DataGrid(
            df_to_render,
            selection_mode="none",
            width="100%",
            height="300px",
        )

    # --- Update Button States ---
    @reactive.Effect
    def _update_button_states():
        idx = current_image_index()
        count = len(uploaded_file_info())
        start_marked = marked_start_index() is not None
        end_marked = marked_end_index() is not None
        single_mode = is_single_image_mode()

        # Navigation buttons
        ui.update_action_button("prev_img", disabled=(count == 0 or idx == 0))
        ui.update_action_button("next_img", disabled=(count == 0 or idx >= count - 1))

        # Save Sequence button: enabled if files are loaded AND either
        # 1) both start/end are marked OR
        # 2) in single image mode with start/end marked
        save_enabled = count > 0 and start_marked and end_marked
        ui.update_action_button("save_sequence", disabled=not save_enabled)

        # Sync button: enabled only if there are saved annotations
        ui.update_action_button("sync", disabled=saved_annotations().empty)

        # Clear data button
        has_data = not saved_annotations().empty or len(uploaded_file_info()) > 0
        ui.update_action_button("clear_data", disabled=not has_data)

        # For checkboxes, instead of disabling them, we'll manage their state through handlers
        # Since we can't use 'disabled' parameter, we'll use CSS styling to visually indicate state
        if single_mode:
            # Add a visual indicator that checkboxes are controlled by single image mode
            ui.notification_show(
                "Mark Start and Mark End are controlled by Single Image Observation mode",
                type="message",
                duration=2,
            )

    # --- Clear Data Button Handler ---
    @reactive.Effect
    @reactive.event(input.clear_data)
    def _handle_clear_data():
        # Reset all state and clear uploaded files
        _reset_all_data()
        ui.notification_show(
            "All data has been cleared",
            type="message",
            duration=3,
        )

    # --- Sync to Google Sheets ---
    @reactive.Effect
    @reactive.event(input.sync)
    def _sync_to_google_sheets():
        ui.notification_show("Syncing started...", duration=2, type="message")
        print("Sync button clicked. Attempting to sync...")

        df_to_sync = saved_annotations()
        if df_to_sync.empty:
            ui.notification_show("No annotations to sync.", duration=3, type="warning")
            print("Sync aborted: No data.")
            return

        # --- Google Sheets API Interaction ---
        try:
            if not os.path.exists(CREDENTIALS_FILE):
                raise FileNotFoundError(
                    f"Credentials file not found at {CREDENTIALS_FILE}"
                )

            creds = Credentials.from_service_account_file(
                CREDENTIALS_FILE, scopes=SCOPES
            )
            client = gspread.authorize(creds)

            try:
                # Try to open the sheet
                try:
                    spreadsheet = client.open(ANNOTATIONS_GOOGLE_SHEET_NAME)
                    sheet = spreadsheet.sheet1
                    print(f"Opened existing sheet: {ANNOTATIONS_GOOGLE_SHEET_NAME}")
                except gspread.exceptions.SpreadsheetNotFound:
                    # Create new sheet if it doesn't exist
                    spreadsheet = client.create(ANNOTATIONS_GOOGLE_SHEET_NAME)
                    sheet = spreadsheet.sheet1
                    print(f"Created new sheet: {ANNOTATIONS_GOOGLE_SHEET_NAME}")

                    # Share the sheet with anyone with the link (view-only)
                    spreadsheet.share(None, perm_type="anyone", role="reader")
                    print(f"Made sheet readable by link")

            except gspread.exceptions.APIError as api_err:
                ui.notification_show(
                    f"API Error: {api_err}. Check scopes and permissions.",
                    duration=5,
                    type="error",
                )
                print(f"API Error: {api_err}")
                return  # Stop if API error occurs

            # Check if sheet is empty or just has headers
            existing_data = sheet.get_all_values()

            if not existing_data:
                # Sheet is completely empty, add headers and data
                headers = df_to_sync.columns.values.tolist()
                data = df_to_sync.fillna("").values.tolist()

                # Write headers and data
                all_rows = [headers] + data
                sheet.update(all_rows)
                print(f"Wrote headers and {len(data)} rows to empty sheet.")

            else:
                # Check if headers match our expected columns
                existing_headers = existing_data[0] if len(existing_data) > 0 else []
                expected_headers = df_to_sync.columns.values.tolist()

                if not existing_headers:
                    # No headers but sheet has data (unlikely but possible)
                    # Insert headers in row 1 and push existing data down
                    sheet.insert_row(expected_headers, 1)
                    print("Inserted headers to sheet with existing data.")

                    # Append our new data
                    data_to_append = df_to_sync.fillna("").values.tolist()
                    sheet.append_rows(data_to_append, value_input_option="USER_ENTERED")
                    print(f"Appended {len(data_to_append)} rows to sheet.")

                elif set(existing_headers) != set(expected_headers):
                    # Headers exist but don't match - handle this situation
                    # Option 1: Append but warn user
                    ui.notification_show(
                        "Warning: Existing columns in Google Sheet don't match expected columns. Data may be misaligned.",
                        duration=7,
                        type="warning",
                    )
                    print(
                        f"Column mismatch. Expected: {expected_headers}, Found: {existing_headers}"
                    )

                    # Append data (using existing headers' structure)
                    # Reorder our dataframe to match existing headers when possible
                    common_headers = [
                        h for h in existing_headers if h in expected_headers
                    ]
                    missing_headers = [
                        h for h in expected_headers if h not in existing_headers
                    ]

                    if len(common_headers) > 0:
                        # We can reorder based on common headers
                        df_reordered = df_to_sync[common_headers].copy()

                        # Append data based on reordered columns
                        data_to_append = df_reordered.fillna("").values.tolist()
                        sheet.append_rows(
                            data_to_append, value_input_option="USER_ENTERED"
                        )
                        print(
                            f"Appended {len(data_to_append)} rows with {len(common_headers)} matching columns."
                        )

                        # Also note missing columns in log
                        if missing_headers:
                            print(f"These columns were not synced: {missing_headers}")
                    else:
                        # No common headers - major mismatch
                        raise ValueError(
                            "Cannot sync: No matching columns between app and Google Sheet."
                        )

                else:
                    # Headers match, simply append data
                    data_to_append = df_to_sync.fillna("").values.tolist()
                    sheet.append_rows(data_to_append, value_input_option="USER_ENTERED")
                    print(
                        f"Appended {len(data_to_append)} rows to sheet with matching headers."
                    )

            # Clear local annotations and uploaded files after successful sync
            annotation_count = len(df_to_sync)
            _reset_all_data()
            ui.notification_show(
                f"Successfully synced {annotation_count} annotations! Data cleared and ready for new annotations.",
                duration=5,
                type="message",
            )
            print("Sync successful, local data cleared.")

        except FileNotFoundError as e:
            print(f"Sync Error: {e}")
            ui.notification_show(
                f"Sync failed: Credentials file missing.", duration=5, type="error"
            )
        except gspread.exceptions.APIError as e:
            print(f"Sync Error: Google API error - {e}")
            ui.notification_show(
                f"Sync failed: Google API Error. Check permissions/scopes.",
                duration=5,
                type="error",
            )
        except Exception as e:
            print(f"Sync Error: An unexpected error occurred - {e}")
            ui.notification_show(
                f"Sync failed: Unexpected error - {e}", duration=5, type="error"
            )


app = App(app_ui, server)
