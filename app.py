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
                dt_obj = datetime.strptime(
                    exif_time_str.split(".")[0], "%Y:%m:%d %H:%M:%S"
                )
                formatted_time = dt_obj.strftime("%Y-%m-%d %H:%M:%S")
                return formatted_time
            except ValueError as e:
                print(
                    f"EXIF DateTime parsing error for {Path(image_path).name} (Value: '{exif_time_str}'): {e}"
                )
                try:
                    time_part = exif_time_str.split(" ")[1]
                    dt_obj = datetime.strptime(time_part, "%H:%M:%S")
                    current_date = datetime.now().strftime("%Y-%m-%d")
                    formatted_time = f"{current_date} {dt_obj.hour:02d}:{dt_obj.minute:02d}:{dt_obj.second:02d}"
                    return formatted_time
                except ValueError:
                    pass

        print(f"Could not extract time for {Path(image_path).name}")
        return ""

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
            ui.input_text("reviewer_name", "Reviewer Name:", ""),
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
            return ui.p(
                f"No data found in Google Sheet '{ASSIGNMENTS_GOOGLE_SHEET_NAME}'."
            )
        else:
            return ui.output_data_frame("google_sheet_table")

    @render.data_frame
    def google_sheet_table():
        df = google_sheet_df.get()
        req(df is not None)
        return render.DataGrid(df, width="100%", height="250px")

    @reactive.Effect
    @reactive.event(input.files)
    def _handle_file_upload():
        files = input.files()
        if not files:
            uploaded_file_info.set([])
            current_image_index.set(0)
        else:
            sorted_files = sorted(files, key=lambda f: f["name"])
            uploaded_file_info.set(sorted_files)
            current_image_index.set(0)
        _reset_markings()
        print("Files uploaded, markings reset.")

    def _reset_markings():
        marked_start_index.set(None)
        marked_end_index.set(None)
        sequence_start_time.set("")
        sequence_end_time.set("")
        is_single_image_mode.set(False)
        ui.update_text("start_time", value="")
        ui.update_text("end_time", value="")
        ui.update_checkbox("mark_start", value=False)
        ui.update_checkbox("mark_end", value=False)
        ui.update_checkbox("single_image", value=False)

    def _reset_all_data():
        uploaded_file_info.set([])
        current_image_index.set(0)
        _reset_markings()
        saved_annotations.set(pd.DataFrame(columns=ANNOTATION_COLUMNS))
        ui.update_text("reviewer_name", value="")
        ui.notification_show(
            "Data cleared. Select new files if needed.", type="message", duration=4
        )

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
            _reset_markings()
            print("Single Image Mode Deactivated")

    @reactive.Effect
    @reactive.event(input.mark_start)
    def _handle_mark_start():
        if is_single_image_mode():
            return
        files = uploaded_file_info()
        idx = current_image_index()
        req(files and 0 <= idx < len(files))
        if input.mark_start():
            current_file: FileInfo = files[idx]
            image_path = current_file["datapath"]
            extracted_time = get_image_capture_time(image_path)
            if marked_end_index.get() == idx:
                ui.notification_show(
                    "Cannot mark the same image as both start and end unless using 'Single Image Observation'.",
                    type="warning",
                    duration=4,
                )
                ui.update_checkbox("mark_start", value=False)
                return
            marked_start_index.set(idx)
            sequence_start_time.set(extracted_time)
            ui.update_text("start_time", value=extracted_time)
            print(f"Marked Start: Index {idx}, Time {extracted_time}")
        else:
            if marked_start_index.get() == idx:
                marked_start_index.set(None)
                sequence_start_time.set("")
                ui.update_text("start_time", value="")
                print(f"Unmarked Start: Index {idx}")

    @reactive.Effect
    @reactive.event(input.mark_end)
    def _handle_mark_end():
        if is_single_image_mode():
            return
        files = uploaded_file_info()
        idx = current_image_index()
        req(files and 0 <= idx < len(files))
        if input.mark_end():
            current_file: FileInfo = files[idx]
            image_path = current_file["datapath"]
            extracted_time = get_image_capture_time(image_path)
            if marked_start_index.get() == idx:
                ui.notification_show(
                    "Cannot mark the same image as both start and end unless using 'Single Image Observation'.",
                    type="warning",
                    duration=4,
                )
                ui.update_checkbox("mark_end", value=False)
                return
            marked_end_index.set(idx)
            sequence_end_time.set(extracted_time)
            ui.update_text("end_time", value=extracted_time)
            print(f"Marked End: Index {idx}, Time {extracted_time}")
        else:
            if marked_end_index.get() == idx:
                marked_end_index.set(None)
                sequence_end_time.set("")
                ui.update_text("end_time", value="")
                print(f"Unmarked End: Index {idx}")

    @reactive.Effect
    def _update_checkbox_states_on_nav():
        idx = current_image_index()
        start_idx = marked_start_index()
        end_idx = marked_end_index()
        single_mode = is_single_image_mode()
        if not single_mode:
            is_start_marked = start_idx is not None and start_idx == idx
            ui.update_checkbox("mark_start", value=is_start_marked)
            is_end_marked = end_idx is not None and end_idx == idx
            ui.update_checkbox("mark_end", value=is_end_marked)
            is_single_image = (
                start_idx is not None
                and end_idx is not None
                and start_idx == end_idx == idx
            )
            ui.update_checkbox("single_image", value=is_single_image)

    @render.text
    def marked_start_display():
        files = uploaded_file_info()
        start_idx = marked_start_index()
        if start_idx is not None and 0 <= start_idx < len(files):
            return f"Start Image Marked: {files[start_idx]['name']}"
        else:
            if start_idx is not None:
                marked_start_index.set(None)
            return "Start Image Marked: None"

    @render.text
    def marked_end_display():
        files = uploaded_file_info()
        end_idx = marked_end_index()
        if end_idx is not None and 0 <= end_idx < len(files):
            start_idx = marked_start_index()
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

    @reactive.Effect
    @reactive.event(input.save_sequence)
    def _save_sequence():
        files = uploaded_file_info()
        start_idx = marked_start_index()
        end_idx = marked_end_index()
        single_mode = is_single_image_mode()
        if start_idx is None or end_idx is None:
            ui.notification_show(
                "Please mark both a start and an end image for the sequence.",
                type="error",
                duration=5,
            )
            return
        if not (0 <= start_idx < len(files) and 0 <= end_idx < len(files)):
            ui.notification_show(
                "Marked image data is outdated (files might have changed). Please re-mark start/end.",
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
        req(input.site(), cancel_output=False)
        req(input.camera(), cancel_output=False)
        req(input.reviewer_name(), cancel_output=False)
        req(input.predator_or_seabird(), cancel_output=False)
        req(input.species(), cancel_output=False)
        req(input.behavior(), cancel_output=False)
        req(sequence_start_time(), cancel_output=False)
        if not all(
            [
                input.site(),
                input.camera(),
                input.predator_or_seabird(),
                input.species(),
                input.behavior(),
                input.reviewer_name(),
                sequence_start_time(),
            ]
        ):
            ui.notification_show(
                "Please fill in all annotation details (Site, Camera, Type, Species, Behavior, Reviewer Name).",
                type="warning",
                duration=5,
            )
            return
        start_filename = files[start_idx]["name"]
        end_filename = files[end_idx]["name"]
        start_t = sequence_start_time()
        end_t = sequence_end_time()
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
                "Reviewer Name": [input.reviewer_name()],
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
        _reset_markings()

    @render.data_frame
    def annotations_table():
        df_to_render = saved_annotations.get()
        if not df_to_render.empty and "Is Single Image" in df_to_render.columns:
            display_cols = ANNOTATION_COLUMNS.copy()
            if "Is Single Image" in display_cols:
                display_cols.remove("Is Single Image")
            df_to_render = df_to_render.copy()
            df_to_render["Annotation Type"] = df_to_render["Is Single Image"].apply(
                lambda x: "Single Image Observation" if x else "Image Sequence"
            )
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

    @reactive.Effect
    def _update_button_states():
        idx = current_image_index()
        count = len(uploaded_file_info())
        start_marked = marked_start_index() is not None
        end_marked = marked_end_index() is not None
        single_mode = is_single_image_mode()
        ui.update_action_button("prev_img", disabled=(count == 0 or idx == 0))
        ui.update_action_button("next_img", disabled=(count == 0 or idx >= count - 1))
        save_enabled = count > 0 and start_marked and end_marked
        ui.update_action_button("save_sequence", disabled=not save_enabled)
        ui.update_action_button("sync", disabled=saved_annotations().empty)
        has_data = not saved_annotations().empty or len(uploaded_file_info()) > 0
        ui.update_action_button("clear_data", disabled=not has_data)
        if single_mode:
            ui.notification_show(
                "Mark Start and Mark End are controlled by Single Image Observation mode",
                type="message",
                duration=2,
            )

    @reactive.Effect
    @reactive.event(input.clear_data)
    def _handle_clear_data():
        _reset_all_data()
        ui.notification_show(
            "All data has been cleared",
            type="message",
            duration=3,
        )

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
                try:
                    spreadsheet = client.open(ANNOTATIONS_GOOGLE_SHEET_NAME)
                    sheet = spreadsheet.sheet1
                    print(f"Opened existing sheet: {ANNOTATIONS_GOOGLE_SHEET_NAME}")
                except gspread.exceptions.SpreadsheetNotFound:
                    spreadsheet = client.create(ANNOTATIONS_GOOGLE_SHEET_NAME)
                    sheet = spreadsheet.sheet1
                    print(f"Created new sheet: {ANNOTATIONS_GOOGLE_SHEET_NAME}")
                    spreadsheet.share(None, perm_type="anyone", role="reader")
                    print(f"Made sheet readable by link")
            except gspread.exceptions.APIError as api_err:
                ui.notification_show(
                    f"API Error: {api_err}. Check scopes and permissions.",
                    duration=5,
                    type="error",
                )
                print(f"API Error: {api_err}")
                return
            existing_data = sheet.get_all_values()
            if not existing_data:
                headers = df_to_sync.columns.values.tolist()
                data = df_to_sync.fillna("").values.tolist()
                all_rows = [headers] + data
                sheet.update(all_rows)
                print(f"Wrote headers and {len(data)} rows to empty sheet.")
            else:
                existing_headers = existing_data[0] if len(existing_data) > 0 else []
                expected_headers = df_to_sync.columns.values.tolist()
                if not existing_headers:
                    sheet.insert_row(expected_headers, 1)
                    print("Inserted headers to sheet with existing data.")
                    data_to_append = df_to_sync.fillna("").values.tolist()
                    sheet.append_rows(data_to_append, value_input_option="USER_ENTERED")
                    print(f"Appended {len(data_to_append)} rows to sheet.")
                elif set(existing_headers) != set(expected_headers):
                    ui.notification_show(
                        "Warning: Existing columns in Google Sheet don't match expected columns. Data may be misaligned.",
                        duration=7,
                        type="warning",
                    )
                    print(
                        f"Column mismatch. Expected: {expected_headers}, Found: {existing_headers}"
                    )
                    common_headers = [
                        h for h in existing_headers if h in expected_headers
                    ]
                    missing_headers = [
                        h for h in expected_headers if h not in existing_headers
                    ]
                    if len(common_headers) > 0:
                        df_reordered = df_to_sync[common_headers].copy()
                        data_to_append = df_reordered.fillna("").values.tolist()
                        sheet.append_rows(
                            data_to_append, value_input_option="USER_ENTERED"
                        )
                        print(
                            f"Appended {len(data_to_append)} rows with {len(common_headers)} matching columns."
                        )
                        if missing_headers:
                            print(f"These columns were not synced: {missing_headers}")
                    else:
                        raise ValueError(
                            "Cannot sync: No matching columns between app and Google Sheet."
                        )
                else:
                    data_to_append = df_to_sync.fillna("").values.tolist()
                    sheet.append_rows(data_to_append, value_input_option="USER_ENTERED")
                    print(
                        f"Appended {len(data_to_append)} rows to sheet with matching headers."
                    )
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
