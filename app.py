# --- Necessary Imports ---
import os
from datetime import datetime
from pathlib import Path
import gspread
import pandas as pd
import shinyswatch
from faicons import icon_svg
from google.auth.exceptions import DefaultCredentialsError
from google.oauth2.service_account import Credentials
from PIL import Image, UnidentifiedImageError
from shiny import App, reactive, render, req, ui
from shiny.types import FileInfo
from shiny.ui import value_box

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

# --- Helper Functions ---


def fetch_google_sheet_data() -> pd.DataFrame | None:
    """Fetches data from the Google Sheet specified by ASSIGNMENTS_GOOGLE_SHEET_NAME."""
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
        # Ensure standard columns exist, add if missing and fill with default
        # Example: Ensure 'Status' column exists
        if "Status" not in df.columns:
            print("Warning: 'Status' column missing in sheet. Adding it.")
            df["Status"] = "Not Started"  # Or some other default
        if "Reviewer" not in df.columns:
            print("Warning: 'Reviewer' column missing in sheet. Adding it.")
            df["Reviewer"] = ""

        return df
    except DefaultCredentialsError:
        print("Error: Could not find default credentials...")
        return None
    except Exception as e:
        print(f"An unexpected error occurred while fetching Google Sheet data: {e}")
        return None


def get_image_capture_time(image_path: str) -> str:
    """Extracts capture time from image EXIF data or falls back to file modification time."""
    try:
        img = Image.open(image_path)
        exif_time_str = None
        try:
            # Use getexif() which returns a dictionary-like object
            exif_data = img.getexif()
            if exif_data:
                # Common EXIF tags for date/time
                datetime_original_tag = 36867  # DateTimeOriginal
                datetime_tag = 306  # DateTime
                # Prefer DateTimeOriginal, fall back to DateTime
                exif_time_str = exif_data.get(datetime_original_tag) or exif_data.get(
                    datetime_tag
                )
        except (
            AttributeError,
            KeyError,
            IndexError,
            TypeError,
            ValueError,
        ) as e:  # Added ValueError
            print(f"Minor EXIF extraction issue for {Path(image_path).name}: {e}")

        if exif_time_str and isinstance(exif_time_str, str):
            try:
                # Handle potential subsecond precision if present (e.g., '2023:10:27 10:30:00.123')
                exif_time_str_clean = exif_time_str.split(".")[0]
                # Common EXIF format: 'YYYY:MM:DD HH:MM:SS'
                dt_obj = datetime.strptime(exif_time_str_clean, "%Y:%m:%d %H:%M:%S")
                formatted_time = dt_obj.strftime("%Y-%m-%d %H:%M:%S")  # Standard format
                return formatted_time
            except ValueError as e:
                print(
                    f"EXIF DateTime parsing error for {Path(image_path).name} (Value: '{exif_time_str}'): {e}"
                )
                # Add more fallback parsing attempts if needed for other formats
                pass  # Fall through to file mod time

        print(
            f"Could not extract valid EXIF time for {Path(image_path).name}, falling back to file mod time."
        )
        # Fallback to file modification time if EXIF fails
        try:
            mtime = os.path.getmtime(image_path)
            return datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S")
        except Exception as file_time_e:
            print(
                f"Could not get file modification time for {Path(image_path).name}: {file_time_e}"
            )
            return ""  # Final fallback: empty string

    except FileNotFoundError:
        print(f"Error: Image file not found at {image_path}")
        return ""
    except UnidentifiedImageError:  # Catch PIL error for unsupported formats
        print(
            f"Error: Cannot identify image file (possibly corrupt or wrong format): {Path(image_path).name}"
        )
        return ""
    except Exception as e:
        print(f"Error processing image {Path(image_path).name}: {e}")
        return ""


# --- UI Definition ---
# Get the path to the directory containing the app script
app_dir = Path(__file__).parent

app_ui = ui.page_fluid(
    # Include the custom CSS file
    ui.include_css(app_dir / "www" / "styles.css"),
    ui.panel_title("Seabird Nest Camera Annotation Tool"),
    # Card for Google Sheet Overview
    ui.card(
        ui.card_header("Camera Assignments Overview"),
        ui.output_ui("google_sheet_display_ui"),
    ),
    ui.layout_sidebar(
        ui.sidebar(
            # Card for Upload and Navigation
            ui.card(
                ui.card_header("Image Upload & Navigation"),
                ui.input_file(
                    "files",
                    "Select images:",
                    multiple=True,
                    accept=[".jpg", ".jpeg", ".png"],
                    button_label="Browse...",
                    placeholder="No files selected",
                ),
                ui.hr(),
                # Use output_ui for the value box
                ui.output_ui("image_counter_vb"),
                ui.div(  # Apply custom class for styling
                    ui.input_action_button(
                        "prev_img", "← Previous", class_="btn-sm btn-outline-primary"
                    ),
                    ui.input_action_button(
                        "next_img", "Next →", class_="btn-sm btn-outline-primary"
                    ),
                    class_="btn-nav-group",  # Custom class for styling
                ),
            ),
            # Card for Sequence Annotation Controls
            ui.card(
                ui.card_header("Sequence Annotation"),
                ui.output_text("current_file_name"),
                # Apply custom class for styling
                ui.div(
                    ui.input_checkbox("mark_start", "Mark Start"),
                    ui.input_checkbox("mark_end", "Mark End"),
                    class_="annotation-markings",
                ),
                # Apply custom class for styling
                ui.div(
                    ui.input_checkbox(
                        "single_image", "Single Image Observation", value=False
                    ),
                    class_="single-image-div",
                ),
                # Apply custom class for styling marked status
                ui.div(
                    ui.output_ui("marked_start_display"),
                    ui.output_ui("marked_end_display"),
                    class_="status-display",
                ),
            ),
            # Card for Metadata Input
            ui.card(
                ui.card_header("Annotation Details"),
                ui.input_select(
                    "site", "Site:", [""] + SITE_LOCATION
                ),  # Add blank option
                ui.input_select(
                    "camera", "Camera:", [""] + CAMERAS
                ),  # Add blank option
                ui.input_date("retrieval_date", "Retrieval Date:"),
                ui.input_radio_buttons(
                    "predator_or_seabird",
                    "Type:",
                    choices=["Predator", "Seabird"],
                    selected="Seabird",
                ),
                ui.input_select("species", "Species:", SPECIES),
                ui.input_select("behavior", "Behavior:", BEHAVIORS),
                ui.input_select(
                    "reviewer_name",
                    "Reviewer Name:",
                    choices=[],  # Populated dynamically
                    selected=None,
                ),
                # These are now derived, make read-only
                ui.input_text("start_time", "Seq Start Time:", ""),
                ui.input_text("end_time", "Seq End Time:", ""),
                ui.hr(),
                ui.input_action_button(
                    "save_sequence",
                    "Save Annotation",
                    class_="btn-success btn-lg w-100",  # Make button bigger and full width
                    icon=icon_svg("floppy-disk"),
                ),
            ),
            width="400px",  # Sidebar width
        ),  # End Sidebar
        # Main content area
        # --- Image Display ---
        ui.output_image(
            "image_display", width="auto", height="auto"
        ),  # Let CSS handle max-width
        ui.hr(),
        # --- Saved Annotations Card ---
        ui.card(
            ui.card_header("Saved Annotations (Current Session)"),
            ui.output_data_frame("annotations_table"),
            # Group buttons at the bottom of the card, apply custom class
            ui.div(
                ui.input_action_button(
                    "sync",
                    "Sync to Google sheets",
                    icon=icon_svg("rotate"),
                    class_="btn-primary",
                ),
                ui.input_action_button(
                    "clear_data",
                    "Clear All Local Data",
                    icon=icon_svg("trash"),
                    class_="btn-warning",
                ),
                class_="action-button-group",  # Custom class for styling
            ),
        ),
    ),  # End layout_sidebar
    theme=shinyswatch.theme.cosmo,  # Keep the base theme
)


# --- Server Function ---
def server(input, output, session):

    # --- Reactive Values and Initial Setup ---
    # **** THIS IS WHERE THE FUNCTION IS CALLED ****
    google_sheet_df = reactive.Value(fetch_google_sheet_data())
    # **** ENSURE fetch_google_sheet_data is defined above ****

    uploaded_file_info = reactive.Value[list[FileInfo]]([])
    current_image_index = reactive.Value(0)
    marked_start_index = reactive.Value[int | None](None)
    marked_end_index = reactive.Value[int | None](None)
    sequence_start_time = reactive.Value("")
    sequence_end_time = reactive.Value("")
    saved_annotations = reactive.Value(pd.DataFrame(columns=ANNOTATION_COLUMNS))
    is_single_image_mode = reactive.Value(False)

    # --- Google Sheet Display Logic ---
    @render.ui
    def google_sheet_display_ui():
        df = google_sheet_df()
        if df is None:
            return ui.tags.div(
                # Using Bootstrap icons for alerts
                ui.HTML(
                    '<i class="bi bi-exclamation-triangle-fill text-danger me-2"></i>'
                ),
                ui.strong("Error:"),
                " Could not load data from Google Sheet.",
                " Check console logs, credentials, API settings, and sheet sharing.",
                class_="alert alert-danger",  # Use Bootstrap alert style
            )
        elif df.empty:
            # Check if columns exist even if empty (they should if fetch_google_sheet_data adds them)
            if "Status" not in df.columns or "Reviewer" not in df.columns:
                return ui.tags.div(
                    ui.HTML('<i class="bi bi-info-circle-fill text-warning me-2"></i>'),
                    f"Warning: Expected columns ('Status', 'Reviewer') missing in Google Sheet '{ASSIGNMENTS_GOOGLE_SHEET_NAME}'. Check sheet structure.",
                    class_="alert alert-warning",
                )
            else:
                # Sheet exists, columns are there, but no assignment rows
                return ui.tags.div(
                    ui.HTML('<i class="bi bi-info-circle-fill text-info me-2"></i>'),
                    "No assignments found in the Google Sheet.",
                    class_="alert alert-info",
                )
            # Optionally render empty table: return ui.output_data_frame("google_sheet_table")
        else:
            # Data loaded successfully
            return ui.output_data_frame("google_sheet_table")

    @render.data_frame
    def google_sheet_table():
        df = google_sheet_df.get()
        req(df is not None and not df.empty)  # Ensure df is loaded and has rows

        # Initialize indices
        completed_indices, not_started_indices, in_progress_indices = [], [], []

        # Safely check 'Status' column and get indices
        if "Status" in df.columns:
            # Convert to string and handle potential NaN/None before comparison
            status_col = df["Status"].fillna("").astype(str)
            completed_indices = df.index[status_col == "Completed"].tolist()
            not_started_indices = df.index[status_col == "Not Started"].tolist()
            in_progress_indices = df.index[status_col == "In Progress"].tolist()
            status_col_index = df.columns.get_loc("Status")
        else:
            print("Warning: 'Status' column not found for styling Google Sheet table.")
            status_col_index = -1  # Indicate column not found

        # Define styles - only apply if status_col_index is valid
        styles = []
        if status_col_index != -1:
            styles = [
                # Base style for Status column
                {"cols": [status_col_index], "style": {"font-weight": "bold"}},
                # Conditional background colors
                {
                    "rows": completed_indices,
                    "cols": [status_col_index],
                    "style": {"background-color": "#d4edda"},
                },  # light green
                {
                    "rows": not_started_indices,
                    "cols": [status_col_index],
                    "style": {"background-color": "#fff3cd"},
                },  # light yellow
                {
                    "rows": in_progress_indices,
                    "cols": [status_col_index],
                    "style": {"background-color": "#cce5ff"},
                },  # light blue
            ]

        return render.DataGrid(
            df.fillna(""),  # Fill NA for display
            width="100%",
            height="250px",  # Adjust height as needed
            styles=styles,
            selection_mode="none",  # Disable selection if not used
        )

    # --- Update Reviewer Choices ---
    @reactive.Effect
    def _update_reviewer_choices():
        df = google_sheet_df()
        reviewer_choices = [""]  # Start with a blank option
        if df is not None and "Reviewer" in df.columns:
            # Get unique names, remove empty strings/NaNs, sort alphabetically
            unique_names = df["Reviewer"].dropna().astype(str).unique()
            unique_names = sorted([name for name in unique_names if name.strip()])
            reviewer_choices.extend(unique_names)
            # print(f"Updating reviewer choices: {reviewer_choices}") # Optional debug
        elif df is None:
            print("Assignments sheet not loaded, cannot update reviewer choices.")
            reviewer_choices = ["Error loading sheet"]
        else:  # df is not None but column is missing
            print("Warning: 'Reviewer' column not found in assignments sheet.")
            reviewer_choices = ["'Reviewer' column missing"]

        current_selection = input.reviewer_name()  # Get current selection
        # Update choices, try to keep current selection if it's still valid
        ui.update_select(
            "reviewer_name",
            choices=reviewer_choices,
            selected=(
                current_selection if current_selection in reviewer_choices else None
            ),
        )

    # --- File Handling Logic ---
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
        print("Files uploaded/cleared, markings reset.")

    def _reset_markings():
        marked_start_index.set(None)
        marked_end_index.set(None)
        sequence_start_time.set("")
        sequence_end_time.set("")
        is_single_image_mode.set(False)
        # Update UI elements related to marking
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
        # Reset form inputs to defaults
        ui.update_select("site", selected="")
        ui.update_select("camera", selected="")
        try:
            # Attempt to set date to today, handle potential errors if input not fully ready
            ui.update_date("retrieval_date", value=datetime.now().date())
        except Exception as e:
            print(f"Minor issue resetting date input: {e}")
            try:
                ui.update_date("retrieval_date", value=None)  # Fallback
            except Exception:
                pass  # Ignore if still fails
        ui.update_radio_buttons("predator_or_seabird", selected="Seabird")
        ui.update_select("species", selected="")
        ui.update_select("behavior", selected="")
        ui.update_select("reviewer_name", selected=None)  # Reset reviewer dropdown

        ui.notification_show(
            "All local data and selections cleared.", type="info", duration=4
        )
        print("All local data cleared.")

    # --- Image Navigation Logic ---
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

    # --- Value Box for Image Counter ---
    @render.ui
    def image_counter_vb():
        count = len(uploaded_file_info())
        idx = current_image_index()
        display_val = f"{idx + 1} / {count}" if count > 0 else "0 / 0"
        return value_box(
            title="Current Image",
            value=display_val,
            showcase=icon_svg("image"),
            theme_color="primary" if count > 0 else "secondary",
            height="100px",
        )

    # --- Current File Name Display ---
    @render.text
    def current_file_name():
        files = uploaded_file_info()
        idx = current_image_index()
        # Use req() to ensure files exist and index is valid before accessing
        req(files and 0 <= idx < len(files))
        return f"Current file: {files[idx]['name']}"

    # --- Image Display ---
    @render.image
    def image_display():
        files = uploaded_file_info()
        idx = current_image_index()
        req(files and 0 <= idx < len(files))
        current_file: FileInfo = files[idx]
        img_src = current_file["datapath"]
        if not img_src or not Path(img_src).exists():
            print(f"Error: Image path is invalid or does not exist: {img_src}")
            # Return placeholder or error indication if image path is bad
            # This depends on how Shiny handles missing src, maybe return None or an empty dict
            return None  # Or {"src": "", "alt": "Error loading image"}
        return {
            "src": img_src,
            "width": "100%",  # Let CSS handle max-width via #image_display img rule
            "height": "auto",
            "alt": f"Image: {current_file['name']}",
            "delete_file": False,  # Explicitly keep temp file until session ends
        }

    # --- Annotation Marking Logic ---
    @reactive.Effect
    @reactive.event(input.single_image)
    def _handle_single_image_mode():
        files = uploaded_file_info()
        idx = current_image_index()
        req(files and 0 <= idx < len(files))  # Ensure valid image context

        is_single = input.single_image()
        is_single_image_mode.set(is_single)

        if is_single:
            # Mark current image as both start and end
            current_file: FileInfo = files[idx]
            image_path = current_file["datapath"]
            extracted_time = get_image_capture_time(image_path)

            marked_start_index.set(idx)
            marked_end_index.set(idx)
            sequence_start_time.set(extracted_time)
            sequence_end_time.set(extracted_time)

            # Update UI (checkboxes will be updated by _update_checkbox_states_on_nav)
            ui.update_text("start_time", value=extracted_time)
            ui.update_text("end_time", value=extracted_time)
            # Force checkbox update immediately as well
            ui.update_checkbox("mark_start", value=True)
            ui.update_checkbox("mark_end", value=True)

            ui.notification_show(
                "Single image mode: This image marked as start & end.",
                type="info",
                duration=4,
            )
            print(f"Single Image Mode Activated: Index {idx}, Time {extracted_time}")
        else:
            # Turning off single image mode
            # If the current image was the one marked (as both start and end), clear markings
            if marked_start_index.get() == idx and marked_end_index.get() == idx:
                _reset_markings()  # Full reset is simplest
                print("Single Image Mode Deactivated - Markings reset")
            else:
                # If markings were different, just unset the flag
                print(
                    "Single Image Mode Deactivated - Keeping existing independent marks"
                )
            # Ensure checkboxes reflect the actual (potentially reset) state
            # _update_checkbox_states_on_nav() will handle this on the next cycle

    @reactive.Effect
    @reactive.event(input.mark_start)
    def _handle_mark_start():
        # If single image mode is on, prevent manual unchecking of start
        if is_single_image_mode():
            current_idx = current_image_index()
            # If the user tries to uncheck start while in single mode for the current image
            if not input.mark_start() and marked_start_index.get() == current_idx:
                ui.update_checkbox("mark_start", value=True)  # Revert checkbox
                ui.notification_show(
                    "Disable 'Single Image Observation' to mark separately.",
                    type="warning",
                    duration=3,
                )
            return  # Ignore further logic in single mode

        # Normal multi-image mode logic
        files = uploaded_file_info()
        idx = current_image_index()
        req(files and 0 <= idx < len(files))

        if input.mark_start():  # If checkbox is checked
            current_file: FileInfo = files[idx]
            image_path = current_file["datapath"]
            extracted_time = get_image_capture_time(image_path)

            # Prevent marking same image as start and end unless in single mode (handled above)
            if marked_end_index.get() == idx:
                ui.notification_show(
                    "Cannot mark same image as start and end here. Use 'Single Image Observation' checkbox.",
                    type="warning",
                    duration=4,
                )
                ui.update_checkbox("mark_start", value=False)  # Revert checkbox
                return

            marked_start_index.set(idx)
            sequence_start_time.set(extracted_time)
            ui.update_text("start_time", value=extracted_time)
            print(f"Marked Start: Index {idx}, Time {extracted_time}")
        else:  # If checkbox is unchecked by user
            # Only unmark if the current image *was* the marked start image
            if marked_start_index.get() == idx:
                marked_start_index.set(None)
                sequence_start_time.set("")
                ui.update_text("start_time", value="")
                print(f"Unmarked Start: Index {idx}")

    @reactive.Effect
    @reactive.event(input.mark_end)
    def _handle_mark_end():
        # If single image mode is on, prevent manual unchecking of end
        if is_single_image_mode():
            current_idx = current_image_index()
            # If the user tries to uncheck end while in single mode for the current image
            if not input.mark_end() and marked_end_index.get() == current_idx:
                ui.update_checkbox("mark_end", value=True)  # Revert checkbox
                ui.notification_show(
                    "Disable 'Single Image Observation' to mark separately.",
                    type="warning",
                    duration=3,
                )
            return  # Ignore further logic in single mode

        # Normal multi-image mode logic
        files = uploaded_file_info()
        idx = current_image_index()
        req(files and 0 <= idx < len(files))

        if input.mark_end():  # If checkbox is checked
            current_file: FileInfo = files[idx]
            image_path = current_file["datapath"]
            extracted_time = get_image_capture_time(image_path)

            # Prevent marking same image as start and end unless in single mode (handled above)
            if marked_start_index.get() == idx:
                ui.notification_show(
                    "Cannot mark same image as start and end here. Use 'Single Image Observation' checkbox.",
                    type="warning",
                    duration=4,
                )
                ui.update_checkbox("mark_end", value=False)  # Revert checkbox
                return

            # Check if end is before start
            start_idx = marked_start_index.get()
            if start_idx is not None and idx < start_idx:
                ui.notification_show(
                    "Warning: End image is before the marked start image.",
                    type="warning",
                    duration=4,
                )
                # Allow marking but show warning

            marked_end_index.set(idx)
            sequence_end_time.set(extracted_time)
            ui.update_text("end_time", value=extracted_time)
            print(f"Marked End: Index {idx}, Time {extracted_time}")
        else:  # If checkbox is unchecked by user
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
        single_mode = is_single_image_mode()  # Read current mode

        # Calculate expected states based on reactives
        is_marked_start = start_idx is not None and start_idx == idx
        is_marked_end = end_idx is not None and end_idx == idx
        # Single image mode checkbox should be checked ONLY if single_mode is True AND
        # the current image is marked as both start and end.
        is_marked_as_single = single_mode and is_marked_start and is_marked_end

        # Update UI checkboxes to reflect the calculated states
        # Use freeze=True to prevent triggering their own reactive effects during update
        with reactive.isolate():
            ui.update_checkbox("single_image", value=is_marked_as_single)
            ui.update_checkbox("mark_start", value=is_marked_start)
            ui.update_checkbox("mark_end", value=is_marked_end)

    # --- Marked Status Display ---
    @render.ui  # Use ui render for HTML
    def marked_start_display():
        files = uploaded_file_info()
        start_idx = marked_start_index()
        text = "Start Marked: None"  # Default text
        if start_idx is not None:
            if 0 <= start_idx < len(files):
                text = f"Start Marked: {files[start_idx]['name']}"
            else:
                # Index out of bounds (e.g., files changed), reset it reactively
                # Using effect priority might be better, but simple reset here is ok
                # print(f"Resetting invalid marked_start_index: {start_idx}")
                # marked_start_index.set(None) # Let next cycle handle it, avoid direct set in render
                text = "Start Marked: (Invalid Index)"
        # Wrap in styled paragraph
        return ui.tags.p(text, class_="text-success" if start_idx is not None else "")

    @render.ui  # Use ui render for HTML
    def marked_end_display():
        files = uploaded_file_info()
        end_idx = marked_end_index()
        start_idx = marked_start_index()  # Need start index for comparison
        single_mode = is_single_image_mode()  # Read current mode

        text = "End Marked: None"  # Default text
        warning_html = ""
        base_class = ""

        if end_idx is not None:
            if 0 <= end_idx < len(files):
                base_text = f"End Marked: {files[end_idx]['name']}"
                base_class = "text-primary"  # Style for marked end

                # Add warning if end is before start (and not single image mode)
                if not single_mode and start_idx is not None and end_idx < start_idx:
                    warning_html = " <strong class='text-danger'>(Warning: Occurs before start!)</strong>"
                    base_class = "text-warning"  # Change base style if warning needed
                text = ui.HTML(
                    base_text + warning_html
                )  # Combine text and potential warning
            else:
                # Index out of bounds
                # print(f"Resetting invalid marked_end_index: {end_idx}")
                # marked_end_index.set(None) # Let next cycle handle it
                text = "End Marked: (Invalid Index)"

        # Wrap in styled paragraph
        return ui.tags.p(text, class_=base_class)

    # --- Save Sequence Logic ---
    @reactive.Effect
    @reactive.event(input.save_sequence)
    def _save_sequence():
        files = uploaded_file_info()
        start_idx = marked_start_index()
        end_idx = marked_end_index()
        single_mode = is_single_image_mode()  # Read current mode

        # --- Validation ---
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
        # Check logical order only if not in single mode
        if not single_mode and end_idx < start_idx:
            ui.notification_show(
                "Sequence End image cannot be before the Start image.",
                type="error",
                duration=5,
            )
            return

        # Check required metadata fields
        req_fields = {
            "Site": input.site(),
            "Camera": input.camera(),
            "Retrieval Date": input.retrieval_date(),  # Check date is selected
            "Type": input.predator_or_seabird(),
            "Species": input.species(),
            # Behavior might be optional, adjust if needed
            "Behavior": input.behavior(),
            "Reviewer Name": input.reviewer_name(),
        }
        # Check for empty strings, None, or potentially Pandas NaT for date
        missing = [
            name for name, val in req_fields.items() if pd.isna(val) or val == ""
        ]

        if missing:
            ui.notification_show(
                f"Please fill in required fields: {', '.join(missing)}.",
                type="warning",
                duration=5,
            )
            return

        # --- Get Data ---
        start_filename = files[start_idx]["name"]
        end_filename = files[end_idx]["name"]
        start_t = sequence_start_time()  # Should be set if start_idx is valid
        end_t = sequence_end_time()  # Should be set if end_idx is valid

        # Double check times were extracted, use placeholder if not
        if not start_t:
            print(
                f"Warning: Start time missing for {start_filename}, using placeholder."
            )
            start_t = "Time Unknown"
        if not end_t:
            print(f"Warning: End time missing for {end_filename}, using placeholder.")
            end_t = start_t  # Use start time or another placeholder if end missing

        retrieval_dt = input.retrieval_date()
        # Format date safely
        formatted_date = (
            retrieval_dt.strftime("%Y-%m-%d") if pd.notna(retrieval_dt) else ""
        )

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
                "Is Single Image": [single_mode],
                "Reviewer Name": [input.reviewer_name()],
            },
            columns=ANNOTATION_COLUMNS,  # Ensure correct column order
        )

        # --- Append to Saved Annotations ---
        current_df = saved_annotations()
        updated_df = pd.concat([current_df, new_sequence], ignore_index=True)
        saved_annotations.set(updated_df)

        # --- Feedback and Reset ---
        if single_mode:
            ui.notification_show(
                f"Single image annotation saved: {start_filename}",
                duration=4,
                type="success",
            )
            print(f"Saved single image annotation: {start_filename}")
        else:
            ui.notification_show(
                f"Sequence saved: {start_filename} to {end_filename}",
                duration=4,
                type="success",
            )
            print(f"Saved sequence: {start_filename} -> {end_filename}")

        _reset_markings()  # Clear markings for next sequence/annotation

    # --- Annotations Table Display ---
    @render.data_frame
    def annotations_table():
        df_to_render = saved_annotations.get()
        # Prepare dataframe for display if not empty
        if not df_to_render.empty:
            display_df = df_to_render.copy()
            # Add Annotation Type column based on 'Is Single Image'
            if "Is Single Image" in display_df.columns:
                display_df["Annotation Type"] = display_df["Is Single Image"].apply(
                    lambda x: "Single Image" if x else "Sequence"  # Shorter text
                )
            else:
                display_df["Annotation Type"] = "Sequence"  # Default if column missing

            # Define desired column order, putting Annotation Type first
            # Make sure all columns in ANNOTATION_COLUMNS exist before trying to use them
            cols_in_df = df_to_render.columns.tolist()
            ordered_cols = ["Annotation Type"] + [
                col
                for col in ANNOTATION_COLUMNS
                if col in cols_in_df and col != "Is Single Image"
            ]
            # Only select columns that actually exist in display_df
            display_df = display_df[
                [col for col in ordered_cols if col in display_df.columns]
            ]

            return render.DataGrid(
                display_df.fillna(""),
                selection_mode="row",
                width="100%",
                height="300px",  # Adjust height as needed
            )
        else:
            # Return an empty DataGrid with correct columns if no annotations saved yet
            display_cols = ["Annotation Type"] + [
                col for col in ANNOTATION_COLUMNS if col != "Is Single Image"
            ]
            return render.DataGrid(
                pd.DataFrame(columns=display_cols),
                selection_mode="row",
                width="100%",
                height="300px",
            )

    # --- Button State Logic ---
    @reactive.Effect
    def _update_button_states():
        # The key issue is here - don't use reactive.isolate() for these values
        # because we need them to trigger updates when they change
        idx = current_image_index()
        count = len(uploaded_file_info())
        start_marked = marked_start_index() is not None
        end_marked = marked_end_index() is not None
        has_annotations = not saved_annotations().empty
        has_files = count > 0

        # Navigation buttons
        ui.update_action_button("prev_img", disabled=(not has_files or idx == 0))
        ui.update_action_button("next_img", disabled=(not has_files or idx >= count - 1))

        # Save button: enabled if files loaded AND start/end are marked
        save_enabled = has_files and start_marked and end_marked
        ui.update_action_button("save_sequence", disabled=not save_enabled)

        # Sync button: enabled only if there are saved annotations
        ui.update_action_button("sync", disabled=not has_annotations)

        # Clear button: enabled if there are uploaded files OR saved annotations
        clear_enabled = has_annotations or has_files
        ui.update_action_button("clear_data", disabled=not clear_enabled)
        
    # --- Clear Data Logic ---
    @reactive.Effect
    @reactive.event(input.clear_data)
    def _handle_clear_data():
        _reset_all_data()
        # Notification shown by _reset_all_data

    # --- Sync Logic ---
    @reactive.Effect
    @reactive.event(input.sync)
    def _sync_to_google_sheets():
        sync_notification_id = None  # Initialize ID variable
        try:
            # Display immediate feedback
            sync_notification_id = ui.notification_show(
                "Syncing started...", duration=None, type="message", close_button=False
            )
            print("Sync button clicked. Attempting to sync...")

            df_to_sync = saved_annotations().copy()  # Work with a copy

            if df_to_sync.empty:
                ui.notification_remove(sync_notification_id)
                ui.notification_show(
                    "No annotations to sync.", duration=3, type="warning"
                )
                print("Sync aborted: No data.")
                return

            # --- Authorization ---
            if not os.path.exists(CREDENTIALS_FILE):
                raise FileNotFoundError(
                    f"Credentials file not found at {CREDENTIALS_FILE}"
                )
            creds = Credentials.from_service_account_file(
                CREDENTIALS_FILE, scopes=SCOPES
            )
            client = gspread.authorize(creds)

            # --- Open or Create Sheet ---
            try:
                spreadsheet = client.open(ANNOTATIONS_GOOGLE_SHEET_NAME)
                sheet = spreadsheet.sheet1
                print(f"Opened existing sheet: {ANNOTATIONS_GOOGLE_SHEET_NAME}")
            except gspread.exceptions.SpreadsheetNotFound:
                print(f"Sheet '{ANNOTATIONS_GOOGLE_SHEET_NAME}' not found, creating...")
                spreadsheet = client.create(ANNOTATIONS_GOOGLE_SHEET_NAME)
                # Make sure the sheet is named correctly if just created
                sheet = spreadsheet.get_worksheet(0)  # Get first sheet
                sheet.update_title("Sheet1")  # Rename if needed, or use sheet1 directly
                print(f"Created new sheet: {ANNOTATIONS_GOOGLE_SHEET_NAME}")
                # Optional: Share - Be careful with permissions
                # spreadsheet.share('your-email@example.com', perm_type='user', role='writer')
            except gspread.exceptions.APIError as api_err:
                raise api_err  # Re-raise to be caught by the main exception block

            # --- Handle Headers and Append Data ---
            # Get current sheet values safely
            try:
                existing_data = (
                    sheet.get_all_values()
                )  # Might fail if sheet is brand new/empty via API sometimes
            except Exception as e:
                print(
                    f"Could not get existing sheet data (maybe sheet is brand new?): {e}"
                )
                existing_data = []  # Assume empty on error

            # Use columns from the DataFrame being synced as the reference
            # Make sure 'Is Single Image' is included if it exists in the dataframe
            expected_headers = df_to_sync.columns.tolist()

            # Ensure data types are suitable for Sheets (convert bools, handle NaNs)
            df_to_sync = df_to_sync.astype(
                object
            )  # Convert types that Sheets might not like
            df_to_sync.replace(
                {pd.NA: "", None: ""}, inplace=True
            )  # Replace Pandas NA and None with empty string
            df_to_sync["Is Single Image"] = df_to_sync["Is Single Image"].astype(
                str
            )  # Convert boolean to string True/False

            if not existing_data:  # Sheet is completely empty
                print("Sheet is empty. Writing headers and data.")
                headers_to_write = expected_headers
                data_to_write = df_to_sync.values.tolist()
                all_rows = [headers_to_write] + data_to_write
                # Use batch_update for efficiency if possible, or simple update
                sheet.update(all_rows, value_input_option="USER_ENTERED")
                print(f"Wrote headers and {len(data_to_write)} rows.")

            else:  # Sheet has existing data
                existing_headers = existing_data[0] if existing_data else []
                if not existing_headers:  # Has rows but no header row
                    print(
                        "Sheet has data but no header row. Inserting headers and appending."
                    )
                    # Insert requires list of lists
                    sheet.insert_rows(
                        [expected_headers], 1, value_input_option="USER_ENTERED"
                    )
                    data_to_append = df_to_sync.values.tolist()
                    sheet.append_rows(data_to_append, value_input_option="USER_ENTERED")
                    print(
                        f"Appended {len(data_to_append)} rows after inserting headers."
                    )
                elif set(existing_headers) == set(
                    expected_headers
                ):  # Headers match (set comparison ignores order)
                    print("Headers match. Appending data.")
                    # Reorder DataFrame to match sheet's header order before appending
                    df_reordered = df_to_sync[existing_headers]
                    data_to_append = df_reordered.values.tolist()
                    sheet.append_rows(data_to_append, value_input_option="USER_ENTERED")
                    print(f"Appended {len(data_to_append)} rows.")
                else:  # Header mismatch
                    print("Warning: Header mismatch between app data and Google Sheet.")
                    print(f"  Sheet Headers: {existing_headers}")
                    print(f"  App Headers:   {expected_headers}")

                    # Option 1: Append data anyway, letting columns mismatch (simpler but messy sheet)
                    # data_to_append = df_to_sync.values.tolist()
                    # sheet.append_rows(data_to_append, value_input_option="USER_ENTERED")
                    # print(f"Appended {len(data_to_append)} rows with potentially mismatched columns.")
                    # mismatch_warning = "Sync completed, but headers mismatched. Data appended; check sheet columns."

                    # Option 2: Append only common columns (safer)
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

                    print(f"Syncing common columns only: {common_headers}")
                    if missing_in_sheet:
                        print(
                            f"Columns NOT in sheet (will not be synced): {missing_in_sheet}"
                        )
                    if extra_in_sheet:
                        print(f"Extra columns found IN sheet: {extra_in_sheet}")

                    df_common = df_to_sync[
                        common_headers
                    ]  # Select only common columns in sheet order
                    data_to_append = df_common.values.tolist()
                    sheet.append_rows(data_to_append, value_input_option="USER_ENTERED")
                    print(
                        f"Appended {len(data_to_append)} rows with {len(common_headers)} common columns."
                    )
                    mismatch_warning = f"Sync completed with header mismatch. Only {len(common_headers)} common columns synced."

                    # Show a persistent warning about mismatch
                    ui.notification_remove(sync_notification_id)  # Remove progress
                    ui.notification_show(mismatch_warning, duration=10, type="warning")
                    _reset_all_data()  # Reset local data after partial/mismatched sync
                    return  # Exit after handling mismatch

            # --- Success Feedback and Reset (if no mismatch exit occurred) ---
            annotation_count = len(df_to_sync)
            ui.notification_remove(sync_notification_id)
            ui.notification_show(
                f"Successfully synced {annotation_count} annotations!",
                duration=5,
                type="success",
            )
            print("Sync successful, local data cleared.")
            _reset_all_data()  # Clear local data after successful sync

        # --- Error Handling ---
        except FileNotFoundError as e:
            print(f"Sync Error: {e}")
            if sync_notification_id:
                ui.notification_remove(sync_notification_id)
            ui.notification_show(
                f"Sync failed: Credentials file missing ('{CREDENTIALS_FILE}').",
                duration=7,
                type="error",
            )
        except gspread.exceptions.APIError as e:
            print(f"Sync Error: Google API error - {e}")
            if sync_notification_id:
                ui.notification_remove(sync_notification_id)
            # Try to parse the error message for clarity
            error_detail = str(e)
            if "PERMISSION_DENIED" in error_detail:
                msg = "Sync failed: Permission denied. Check sheet sharing settings and service account permissions."
            elif "Quota exceeded" in error_detail:
                msg = (
                    "Sync failed: Google API Quota exceeded. Wait and try again later."
                )
            else:
                msg = f"Sync failed: Google API Error. Check permissions/quotas. Details: {error_detail[:100]}..."  # Show snippet
            ui.notification_show(msg, duration=10, type="error")
        except ValueError as e:  # Catch specific errors like column mismatch failure
            print(f"Sync Error: {e}")
            if sync_notification_id:
                ui.notification_remove(sync_notification_id)
            ui.notification_show(f"Sync failed: {e}", duration=7, type="error")
        except Exception as e:
            print(
                f"Sync Error: An unexpected error occurred - {type(e).__name__}: {e}",
                exc_info=True,
            )  # Log traceback
            if sync_notification_id:
                ui.notification_remove(sync_notification_id)
            ui.notification_show(
                f"Sync failed: Unexpected error - {type(e).__name__}. Check console logs.",
                duration=7,
                type="error",
            )


app = App(app_ui, server)
