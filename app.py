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
SEABIRD_SPECIES = [
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
    "Sooty Tern (Onychoprion fuscatus)",
    "Kōlea (Pluvialis fulva)",
    "Unidentified Pewee (Contopus sp.)"
]
PREDATOR_SPECIES = [
    "",
    "Rat (Rattus sp.)",
    "Cat (Felis catus)",
    "Mongoose (Herpestes javanicus)",
    "Barn Owl (Tyto alba)",
    "Dog (Canis lupus familiaris)",
    "Goat (Capra hircus)",
    "Deer (Cervidae)",
    "Black-crowned Night-Heron (Nycticorax nycticorax)",
    "Cattle Egret (Bubulcus ibis)",
]
SEABIRD_BEHAVIORS = [
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
PREDATOR_BEHAVIORS = [
    "",
    "Predation",
    "Scavenging",
    "Passing through",
    "Hunting",
    "Resting",
    "Foraging",
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
            try:
                header = sheet.row_values(1)
            except Exception:
                header = []
            return pd.DataFrame(columns=header) if header else pd.DataFrame()

        df = pd.DataFrame(data)
        if "Status" not in df.columns:
            print("Warning: 'Status' column missing in sheet. Adding it.")
            df["Status"] = "Not Started"
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
    try:
        img = Image.open(image_path)
        exif_time_str = None
        try:
            exif_data = img.getexif()
            if exif_data:
                datetime_original_tag = 36867
                datetime_tag = 306
                exif_time_str = exif_data.get(datetime_original_tag) or exif_data.get(
                    datetime_tag
                )
        except (AttributeError, KeyError, IndexError, TypeError, ValueError) as e:
            print(f"Minor EXIF extraction issue for {Path(image_path).name}: {e}")

        if exif_time_str and isinstance(exif_time_str, str):
            try:
                exif_time_str_clean = exif_time_str.split(".")[0]
                dt_obj = datetime.strptime(exif_time_str_clean, "%Y:%m:%d %H:%M:%S")
                formatted_time = dt_obj.strftime("%Y-%m-%d %H:%M:%S")
                return formatted_time
            except ValueError as e:
                print(
                    f"EXIF DateTime parsing error for {Path(image_path).name} (Value: '{exif_time_str}'): {e}"
                )
                pass

        print(
            f"Could not extract valid EXIF time for {Path(image_path).name}, falling back to file mod time."
        )
        try:
            mtime = os.path.getmtime(image_path)
            return datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S")
        except Exception as file_time_e:
            print(
                f"Could not get file modification time for {Path(image_path).name}: {file_time_e}"
            )
            return ""
    except FileNotFoundError:
        print(f"Error: Image file not found at {image_path}")
        return ""
    except UnidentifiedImageError:
        print(
            f"Error: Cannot identify image file (possibly corrupt or wrong format): {Path(image_path).name}"
        )
        return ""
    except Exception as e:
        print(f"Error processing image {Path(image_path).name}: {e}")
        return ""


app_dir = Path(__file__).parent

app_ui = ui.page_fluid(
    ui.include_css(app_dir / "www" / "styles.css"),
    ui.include_js(app_dir / "www" / "keyboard-nav.js"),
    ui.panel_title("Seabird Nest Camera Annotation Tool"),
    ui.card(
        ui.card_header("Camera Assignments Overview"),
        ui.output_ui("google_sheet_display_ui"),
    ),
    ui.layout_sidebar(
        ui.sidebar(
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
                ui.output_ui("image_counter_vb"),
                ui.div(
                    ui.input_action_button(
                        "prev_img", "← Previous", class_="btn-sm btn-outline-primary"
                    ),
                    ui.input_action_button(
                        "next_img", "Next →", class_="btn-sm btn-outline-primary"
                    ),
                    ui.tags.small(
                        ui.HTML(
                            f"{icon_svg('keyboard')} Tip: Use ←/→ arrows to navigate, S/E to mark start/end, I for single image"
                        ),
                        class_="d-block text-center text-muted mt-2",
                    ),
                    class_="btn-nav-group",
                ),
            ),
            ui.div(
                ui.div(
                    ui.div(
                        ui.HTML(
                            f"""
                            <div class="sequence-icon pulsing-icon">
                                {icon_svg("film")}
                            </div>
                        """
                        ),
                        ui.span("Sequence Annotation", class_="ms-2"),
                        class_="sequence-annotation-header",
                    ),
                    ui.div(
                        ui.div(
                            ui.input_checkbox(
                                "mark_start",
                                ui.HTML(
                                    f"{icon_svg('circle-play')} Mark as Sequence Start <span class='key-shortcut'>S</span>"
                                ),
                            ),
                            ui.input_checkbox(
                                "mark_end",
                                ui.HTML(
                                    f"{icon_svg('circle-stop')} Mark as Sequence End <span class='key-shortcut'>E</span>"
                                ),
                            ),
                            class_="annotation-markings",
                        ),
                        ui.div(
                            ui.input_checkbox(
                                "single_image",
                                ui.HTML(
                                    f"{icon_svg('image')} Single Image Observation <span class='key-shortcut'>I</span>"
                                ),
                                value=False,
                            ),
                            class_="single-image-div",
                        ),
                        ui.div(
                            ui.output_ui("marked_start_display"),
                            ui.output_ui("marked_end_display"),
                            class_="status-display",
                        ),
                    ),
                    class_="sequence-annotation-body",
                ),
                style="margin-bottom: 20px;",
            ),
            ui.card(
                ui.card_header("Annotation Details"),
                ui.input_select("site", "Site:", [""] + SITE_LOCATION),
                ui.input_select("camera", "Camera:", [""] + CAMERAS),
                ui.input_date("retrieval_date", "Retrieval Date:"),
                ui.input_radio_buttons(
                    "predator_or_seabird",
                    "Type:",
                    choices=["Seabird", "Predator"],
                    selected="Seabird",
                ),
                ui.input_select("species", "Species:", choices=[""]),
                ui.input_select("behavior", "Behavior:", choices=[""]),
                ui.input_select(
                    "reviewer_name", "Reviewer Name:", choices=[], selected=None
                ),
                ui.input_text("start_time", "Seq Start Time:", ""),
                ui.input_text("end_time", "Seq End Time:", ""),
                ui.hr(),
                ui.output_ui("last_reviewed_info"),
                ui.hr(),
                ui.input_action_button(
                    "save_sequence",
                    "Save Annotation",
                    class_="btn-success btn-lg w-100",
                    icon=icon_svg("floppy-disk"),
                ),
            ),
            width="400px",
        ),
        ui.div(
            ui.div(
                ui.output_image("image_display"),
                style="max-height: 500px; overflow: hidden; margin-bottom: 20px; background-color: #f8f9fa; border-radius: 5px; padding: 10px;"
            ),
            ui.card(
                ui.card_header("Saved Annotations (Current Session)"),
                ui.output_data_frame("annotations_table"),
                ui.div(
                    ui.input_action_button(
                        "sync",
                        ui.HTML(
                            f"""
                            <span style="
                                display:inline-block;
                                animation: sync-flatter 1.2s infinite cubic-bezier(.68,-0.55,.27,1.55);
                                transform-origin: 50% 50%;
                            ">
                                {icon_svg("rotate")}
                            </span>
                            <span style="margin-left: 8px;">Sync to Google sheets</span>
                            <style>
                            @keyframes sync-flatter {{
                                0%   {{ transform: scale(1) rotate(0deg); filter: drop-shadow(0 0 0 #00bfff); }}
                                20%  {{ transform: scale(1.15) rotate(-10deg); filter: drop-shadow(0 0 6px #00bfff); }}
                                40%  {{ transform: scale(1.25) rotate(10deg); filter: drop-shadow(0 0 12px #00bfff); }}
                                60%  {{ transform: scale(1.15) rotate(-10deg); filter: drop-shadow(0 0 6px #00bfff); }}
                                80%  {{ transform: scale(1.05) rotate(5deg); filter: drop-shadow(0 0 3px #00bfff); }}
                                100% {{ transform: scale(1) rotate(0deg); filter: drop-shadow(0 0 0 #00bfff); }}
                            }}
                            </style>
                            """
                        ),
                        class_="btn-primary sync-animated-btn",
                    ),
                    ui.input_action_button(
                        "clear_data",
                        "Clear All Local Data",
                        icon=icon_svg("trash"),
                        class_="btn-danger",
                    ),
                    class_="action-button-group",
                ),
            ),
            style="display: flex; flex-direction: column; height: 100%;"
        ),
    ),
    theme=shinyswatch.theme.pulse,
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
    
    # Track the last reviewed image
    last_reviewed_index = reactive.Value[int | None](None)
    last_reviewed_filename = reactive.Value("")
    last_reviewed_species = reactive.Value("")
    last_reviewed_type = reactive.Value("")
    last_reviewed_time = reactive.Value("")


    @render.ui
    def google_sheet_display_ui():
        df = google_sheet_df()
        if df is None:
            return ui.tags.div(
                ui.HTML(
                    '<i class="bi bi-exclamation-triangle-fill text-danger me-2"></i>'
                ),
                ui.strong("Error:"),
                " Could not load data...",
                class_="alert alert-danger",
            )
        elif df.empty:
            if "Status" not in df.columns or "Reviewer" not in df.columns:
                return ui.tags.div(
                    ui.HTML('<i class="bi bi-info-circle-fill text-warning me-2"></i>'),
                    "Warning: Expected columns missing...",
                    class_="alert alert-warning",
                )
            else:
                return ui.tags.div(
                    ui.HTML('<i class="bi bi-info-circle-fill text-info me-2"></i>'),
                    "No assignments found...",
                    class_="alert alert-info",
                )
        else:
            return ui.output_data_frame("google_sheet_table")

    @render.ui
    def last_reviewed_info():
        # Check if we have a last reviewed image
        if last_reviewed_index() is None:
            return ui.tags.div(
                ui.HTML(
                    f"""
                    <div class="text-muted text-center py-3">
                        {icon_svg('circle-info')} No images reviewed yet
                    </div>
                    """
                )
            )
        
        # Get information about the last reviewed image
        filename = last_reviewed_filename()
        species = last_reviewed_species()
        review_type = last_reviewed_type()
        timestamp = last_reviewed_time()
        
        return ui.tags.div(
            ui.HTML(
                f"""
                <div class="last-reviewed-info">
                    <h5>{icon_svg('circle-check')} Last Reviewed</h5>
                    <p><strong>File:</strong> {filename}</p>
                    <p><strong>Type:</strong> {review_type}</p>
                    <p><strong>Species:</strong> {species}</p>
                    <p class="timestamp">{timestamp}</p>
                </div>
                """
            ),
        )

    @render.data_frame
    def google_sheet_table():
        df = google_sheet_df.get()
        req(df is not None and not df.empty)
        completed_indices, not_started_indices, in_progress_indices = [], [], []
        if "Status" in df.columns:
            status_col = df["Status"].fillna("").astype(str)
            completed_indices = df.index[status_col == "Completed"].tolist()
            not_started_indices = df.index[status_col == "Not Started"].tolist()
            in_progress_indices = df.index[status_col == "In Progress"].tolist()
            status_col_index = df.columns.get_loc("Status")
        else:
            status_col_index = -1
        styles = []
        if status_col_index != -1:
            styles = [
                {"cols": [status_col_index], "style": {"font-weight": "bold"}},
                {
                    "rows": completed_indices,
                    "cols": [status_col_index],
                    "style": {"background-color": "#d4edda"},
                },
                {
                    "rows": not_started_indices,
                    "cols": [status_col_index],
                    "style": {"background-color": "#fff3cd"},
                },
                {
                    "rows": in_progress_indices,
                    "cols": [status_col_index],
                    "style": {"background-color": "#cce5ff"},
                },
            ]
        return render.DataGrid(
            data=df.fillna(""),
            width="100%",
            height="250px",
            styles=styles,
            selection_mode="none",
        )

    @reactive.Effect
    def _update_reviewer_choices():
        df = google_sheet_df()
        reviewer_choices = [""]
        if df is not None and "Reviewer" in df.columns:
            unique_names = df["Reviewer"].dropna().astype(str).unique()
            unique_names = sorted([name for name in unique_names if name.strip()])
            reviewer_choices.extend(unique_names)
        elif df is None:
            reviewer_choices = ["Error loading sheet"]
        else:
            reviewer_choices = ["'Reviewer' column missing"]
        current_selection = input.reviewer_name()
        ui.update_select(
            "reviewer_name",
            choices=reviewer_choices,
            selected=(
                current_selection if current_selection in reviewer_choices else None
            ),
        )

    @reactive.Effect
    @reactive.event(input.predator_or_seabird)
    def _update_species_behavior_choices():
        selected_type = input.predator_or_seabird()
        if selected_type == "Seabird":
            species_choices = SEABIRD_SPECIES
            behavior_choices = SEABIRD_BEHAVIORS
        elif selected_type == "Predator":
            species_choices = PREDATOR_SPECIES
            behavior_choices = PREDATOR_BEHAVIORS
        else:
            species_choices = [""]
            behavior_choices = [""]
        ui.update_select("species", choices=species_choices, selected="")
        ui.update_select("behavior", choices=behavior_choices, selected="")

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
        print("Files uploaded/cleared, markings reset.")

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
        # Reset last reviewed image tracking
        last_reviewed_index.set(None)
        last_reviewed_filename.set("")
        last_reviewed_species.set("")
        last_reviewed_type.set("")
        last_reviewed_time.set("")
        ui.update_select("site", selected="")
        ui.update_select("camera", selected="")
        try:
            ui.update_date("retrieval_date", value=datetime.now().date())
        except Exception as e:
            print(f"Minor issue resetting date input to today: {e}")
            try:
                ui.update_date("retrieval_date", value=None)
            except Exception as inner_e:
                print(f"Further issue resetting date input to None: {inner_e}")
                pass
        ui.update_radio_buttons("predator_or_seabird", selected="Seabird")
        ui.update_select("reviewer_name", selected=None)
        ui.notification_show(
            "All local data and selections cleared.", type="info", duration=4
        )
        print("All local data cleared.")

    @reactive.Effect
    @reactive.event(input.next_img)
    def _go_to_next_image():
        current_idx = current_image_index()
        files = uploaded_file_info()
        max_idx = len(files) - 1
        if current_idx < max_idx:
            new_idx = current_idx + 1
            current_image_index.set(new_idx)

    @reactive.Effect
    @reactive.event(input.prev_img)
    def _go_to_previous_image():
        current_idx = current_image_index()
        if current_idx > 0:
            new_idx = current_idx - 1
            current_image_index.set(new_idx)

    @render.ui
    def image_counter_vb():
        count = len(uploaded_file_info())
        idx = current_image_index()
        display_val = f"{idx + 1} / {count}" if count > 0 else "0 / 0"
        animated_icon = ui.HTML(
            f"""
            <span style="
            display:inline-block;
            animation: bounce 1.8s infinite alternate;
            ">
            {icon_svg("image")}
            </span>
            <style>
            @keyframes bounce {{
            0%   {{ transform: translateY(0); }}
            50%  {{ transform: translateY(-12px); }}
            100% {{ transform: translateY(0); }}
            }}
            </style>
            """
        )
        return value_box(
            title="Current Image",
            value=display_val,
            showcase=animated_icon,
            theme_color="primary" if count > 0 else "secondary",
            height="100px",
        )

    @render.text
    def current_file_name():
        files = uploaded_file_info()
        idx = current_image_index()
        req(files and 0 <= idx < len(files))
        return f"Current: {files[idx]['name']}"

    @render.image
    def image_display():
        files = uploaded_file_info()
        idx = current_image_index()
        req(files and 0 <= idx < len(files))
        current_file: FileInfo = files[idx]
        img_src = current_file["datapath"]
        if not img_src or not Path(img_src).exists():
            print(f"Error: Image path is invalid or does not exist: {img_src}")
            return None
        
        # If this image is the last reviewed image, add a reviewed indicator div around it
        if last_reviewed_index() is not None and idx == last_reviewed_index():
            # Using a JavaScript onload event to create and append the indicator
            return {
                "src": img_src,
                "width": "auto",
                "height": "500px",
                "alt": f"Image: {current_file['name']}",
                "delete_file": False,
                "style": "object-fit: contain; max-width: 100%; display: block; margin: 0 auto;",
                "class": "image-with-indicator",
                "onload": """
                    (function() {
                        var img = this;
                        var container = document.createElement('div');
                        container.className = 'image-container';
                        
                        var indicator = document.createElement('div');
                        indicator.className = 'reviewed-indicator';
                        indicator.innerHTML = '<i class="fa fa-check"></i>';
                        
                        img.parentNode.insertBefore(container, img);
                        container.appendChild(img);
                        container.appendChild(indicator);
                    })();
                """
            }
        
        return {
            "src": img_src,
            "width": "auto",
            "height": "500px",
            "alt": f"Image: {current_file['name']}",
            "delete_file": False,
            "style": "object-fit: contain; max-width: 100%; display: block; margin: 0 auto;"
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
                "Single image mode: This image marked as start & end.",
                type="info",
                duration=4,
            )
            print(f"Single Image Mode Activated: Index {idx}, Time {extracted_time}")
        else:
            if marked_start_index.get() == idx and marked_end_index.get() == idx:
                _reset_markings()
                print("Single Image Mode Deactivated - Markings reset")
            else:
                print(
                    "Single Image Mode Deactivated - Keeping existing independent marks"
                )

    @reactive.Effect
    @reactive.event(input.mark_start)
    def _handle_mark_start():
        if is_single_image_mode():
            current_idx = current_image_index()
            if not input.mark_start() and marked_start_index.get() == current_idx:
                ui.update_checkbox("mark_start", value=True)
                ui.notification_show(
                    "Disable 'Single Image Observation' to mark separately.",
                    type="warning",
                    duration=3,
                )
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
                    "Cannot mark same image as start and end here...",
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
            current_idx = current_image_index()
            if not input.mark_end() and marked_end_index.get() == current_idx:
                ui.update_checkbox("mark_end", value=True)
                ui.notification_show(
                    "Disable 'Single Image Observation' to mark separately.",
                    type="warning",
                    duration=3,
                )
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
                    "Cannot mark same image as start and end here...",
                    type="warning",
                    duration=4,
                )
                ui.update_checkbox("mark_end", value=False)
                return
            start_idx = marked_start_index.get()
            if start_idx is not None and idx < start_idx:
                ui.notification_show(
                    "Warning: End image is before the marked start image.",
                    type="warning",
                    duration=4,
                )
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
        is_marked_start = start_idx is not None and start_idx == idx
        is_marked_end = end_idx is not None and end_idx == idx
        is_marked_as_single = single_mode and is_marked_start and is_marked_end
        with reactive.isolate():
            ui.update_checkbox("single_image", value=is_marked_as_single)
            ui.update_checkbox("mark_start", value=is_marked_start)
            ui.update_checkbox("mark_end", value=is_marked_end)

    @render.ui
    def marked_start_display():
        files = uploaded_file_info()
        start_idx = marked_start_index()

        if start_idx is None:
            return ui.tags.div(
                ui.HTML(f"{icon_svg('circle-play')} No start marked"), class_=""
            )

        if 0 <= start_idx < len(files):
            filename = files[start_idx]["name"]
            # Truncate if filename is too long
            if len(filename) > 30:
                display_name = filename[:27] + "..."
            else:
                display_name = filename

            return ui.tags.div(
                ui.HTML(f"{icon_svg('circle-play')} Start: {display_name}"),
                class_="text-success",
            )
        else:
            return ui.tags.div(
                ui.HTML(f"{icon_svg('triangle-exclamation')} Start: Invalid Index"),
                class_="text-danger",
            )

    @render.ui
    def marked_end_display():
        files = uploaded_file_info()
        end_idx = marked_end_index()
        start_idx = marked_start_index()
        single_mode = is_single_image_mode()

        if end_idx is None:
            return ui.tags.div(
                ui.HTML(f"{icon_svg('circle-stop')} No end marked"), class_=""
            )

        if 0 <= end_idx < len(files):
            filename = files[end_idx]["name"]
            # Truncate if filename is too long
            if len(filename) > 30:
                display_name = filename[:27] + "..."
            else:
                display_name = filename

            base_class = "text-primary"
            warning_html = ""

            if not single_mode and start_idx is not None and end_idx < start_idx:
                base_class = "text-warning"
                warning_html = f" {icon_svg('triangle-exclamation')} Before start!"

            return ui.tags.div(
                ui.HTML(f"{icon_svg('circle-stop')} End: {display_name}{warning_html}"),
                class_=base_class,
            )
        else:
            return ui.tags.div(
                ui.HTML(f"{icon_svg('triangle-exclamation')} End: Invalid Index"),
                class_="text-danger",
            )

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
                "Marked image data is outdated...", type="error", duration=6
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
        req_fields = {
            "Site": input.site(),
            "Camera": input.camera(),
            "Retrieval Date": input.retrieval_date(),
            "Type": input.predator_or_seabird(),
            "Species": input.species(),
            "Behavior": input.behavior(),
            "Reviewer Name": input.reviewer_name(),
        }
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
        start_filename = files[start_idx]["name"]
        end_filename = files[end_idx]["name"]
        start_t = sequence_start_time()
        end_t = sequence_end_time()
        if not start_t:
            print(f"Warning: Start time missing for {start_filename}...")
            start_t = "Time Unknown"
        if not end_t:
            print(f"Warning: End time missing for {end_filename}...")
            end_t = start_t
        retrieval_dt = input.retrieval_date()
        formatted_date = (
            retrieval_dt.strftime("%Y-%m-%d") if pd.notna(retrieval_dt) else ""
        )
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
        
        # Update last reviewed image tracking
        current_idx = current_image_index()
        last_reviewed_index.set(current_idx)
        last_reviewed_filename.set(files[current_idx]["name"])
        last_reviewed_species.set(input.species())
        last_reviewed_type.set(input.predator_or_seabird())
        last_reviewed_time.set(datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        
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
        _reset_markings()

    @render.data_frame
    def annotations_table():
        df_to_render = saved_annotations.get()
        if not df_to_render.empty:
            display_df = df_to_render.copy()
            if "Is Single Image" in display_df.columns:
                display_df["Annotation Type"] = display_df["Is Single Image"].apply(
                    lambda x: "Single Image" if x else "Sequence"
                )
            else:
                display_df["Annotation Type"] = "Sequence"
            cols_in_df = df_to_render.columns.tolist()
            ordered_cols = ["Annotation Type"] + [
                col
                for col in ANNOTATION_COLUMNS
                if col in cols_in_df and col != "Is Single Image"
            ]
            display_df = display_df[
                [col for col in ordered_cols if col in display_df.columns]
            ]
            return render.DataGrid(
                display_df.fillna(""),
                selection_mode="none",
                width="100%",
                height="300px",
            )
        else:
            display_cols = ["Annotation Type"] + [
                col for col in ANNOTATION_COLUMNS if col != "Is Single Image"
            ]
            return render.DataGrid(
                pd.DataFrame(columns=display_cols),
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
        has_annotations = not saved_annotations().empty
        has_files = count > 0
        ui.update_action_button("prev_img", disabled=(not has_files or idx == 0))
        ui.update_action_button(
            "next_img", disabled=(not has_files or idx >= count - 1)
        )
        save_enabled = has_files and start_marked and end_marked
        ui.update_action_button("save_sequence", disabled=not save_enabled)
        ui.update_action_button("sync", disabled=not has_annotations)
        clear_enabled = has_annotations or has_files
        ui.update_action_button("clear_data", disabled=not clear_enabled)

    @reactive.Effect
    @reactive.event(input.clear_data)
    def _handle_clear_data():
        _reset_all_data()

    @reactive.Effect
    @reactive.event(input.sync)
    def _sync_to_google_sheets():
        sync_notification_id = None
        try:
            sync_notification_id = ui.notification_show(
                "Syncing started...", duration=None, type="message", close_button=False
            )
            print("Sync button clicked. Attempting to sync...")
            df_to_sync = saved_annotations().copy()
            if df_to_sync.empty:
                ui.notification_remove(sync_notification_id)
                ui.notification_show(
                    "No annotations to sync.", duration=3, type="warning"
                )
                print("Sync aborted: No data.")
                return
            if not os.path.exists(CREDENTIALS_FILE):
                raise FileNotFoundError(
                    f"Credentials file not found at {CREDENTIALS_FILE}"
                )
            creds = Credentials.from_service_account_file(
                CREDENTIALS_FILE, scopes=SCOPES
            )
            client = gspread.authorize(creds)
            try:
                spreadsheet = client.open(ANNOTATIONS_GOOGLE_SHEET_NAME)
                sheet = spreadsheet.sheet1
                print(f"Opened existing sheet: {ANNOTATIONS_GOOGLE_SHEET_NAME}")
            except gspread.exceptions.SpreadsheetNotFound:
                print(f"Sheet '{ANNOTATIONS_GOOGLE_SHEET_NAME}' not found, creating...")
                spreadsheet = client.create(ANNOTATIONS_GOOGLE_SHEET_NAME)
                sheet = spreadsheet.get_worksheet(0)
                sheet.update_title("Sheet1")
                print(f"Created new sheet: {ANNOTATIONS_GOOGLE_SHEET_NAME}")
            except gspread.exceptions.APIError as api_err:
                raise api_err
            try:
                existing_data = sheet.get_all_values()
            except Exception as e:
                print(f"Could not get existing sheet data: {e}")
                existing_data = []
            expected_headers = df_to_sync.columns.tolist()
            df_to_sync = df_to_sync.astype(object)
            df_to_sync.replace({pd.NA: "", None: ""}, inplace=True)
            df_to_sync["Is Single Image"] = df_to_sync["Is Single Image"].astype(str)
            if not existing_data:
                print("Sheet is empty. Writing headers and data.")
                headers_to_write = expected_headers
                data_to_write = df_to_sync.values.tolist()
                all_rows = [headers_to_write] + data_to_write
                sheet.update(all_rows, value_input_option="USER_ENTERED")
                print(f"Wrote headers and {len(data_to_write)} rows.")
            else:
                existing_headers = existing_data[0] if existing_data else []
                if not existing_headers:
                    print("Sheet has data but no header row...")
                    sheet.insert_rows(
                        [expected_headers], 1, value_input_option="USER_ENTERED"
                    )
                    data_to_append = df_to_sync.values.tolist()
                    sheet.append_rows(data_to_append, value_input_option="USER_ENTERED")
                    print(
                        f"Appended {len(data_to_append)} rows after inserting headers."
                    )
                elif set(existing_headers) == set(expected_headers):
                    print("Headers match. Appending data.")
                    df_reordered = df_to_sync[existing_headers]
                    data_to_append = df_reordered.values.tolist()
                    sheet.append_rows(data_to_append, value_input_option="USER_ENTERED")
                    print(f"Appended {len(data_to_append)} rows.")
                else:
                    print("Warning: Header mismatch...")
                    print(f" Sheet Headers: {existing_headers}")
                    print(f" App Headers:   {expected_headers}")
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
                        raise ValueError("Cannot sync: No matching columns found...")
                    print(f"Syncing common columns only: {common_headers}")
                    if missing_in_sheet:
                        print(f"Columns NOT in sheet: {missing_in_sheet}")
                    if extra_in_sheet:
                        print(f"Extra columns found IN sheet: {extra_in_sheet}")
                    df_common = df_to_sync[common_headers]
                    data_to_append = df_common.values.tolist()
                    sheet.append_rows(data_to_append, value_input_option="USER_ENTERED")
                    print(
                        f"Appended {len(data_to_append)} rows with {len(common_headers)} common columns."
                    )
                    mismatch_warning = f"Sync completed with header mismatch. Only {len(common_headers)} common columns synced."
                    ui.notification_remove(sync_notification_id)
                    ui.notification_show(mismatch_warning, duration=10, type="warning")
                    _reset_all_data()
                    return
            annotation_count = len(df_to_sync)
            ui.notification_remove(sync_notification_id)
            ui.notification_show(
                f"Successfully synced {annotation_count} annotations!",
                duration=5,
                type="success",
            )
            print("Sync successful, local data cleared.")
            _reset_all_data()
        except FileNotFoundError as e:
            print(f"Sync Error: {e}")
            ui.notification_remove(sync_notification_id)
            ui.notification_show(
                f"Sync failed: Credentials file missing ('{CREDENTIALS_FILE}').",
                duration=7,
                type="error",
            )
        except gspread.exceptions.APIError as e:
            print(f"Sync Error: Google API error - {e}")
            ui.notification_remove(sync_notification_id)
            error_detail = str(e)
            if "PERMISSION_DENIED" in error_detail:
                msg = "Sync failed: Permission denied..."
            elif "Quota exceeded" in error_detail:
                msg = "Sync failed: Google API Quota exceeded..."
            else:
                msg = (
                    f"Sync failed: Google API Error... Details: {error_detail[:100]}..."
                )
            ui.notification_show(msg, duration=10, type="error")
        except ValueError as e:
            print(f"Sync Error: {e}")
            ui.notification_remove(sync_notification_id)
            ui.notification_show(f"Sync failed: {e}", duration=7, type="error")
        except Exception as e:
            print(
                f"Sync Error: An unexpected error occurred - {type(e).__name__}: {e}",
                exc_info=True,
            )
            ui.notification_remove(sync_notification_id)
            ui.notification_show(
                f"Sync failed: Unexpected error - {type(e).__name__}...",
                duration=7,
                type="error",
            )


app = App(app_ui, server)
