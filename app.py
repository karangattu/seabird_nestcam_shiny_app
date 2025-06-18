import os
import base64
from datetime import datetime
from pathlib import Path
from typing import Optional

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
    "LOC001",
    "LOC002",
    "LOC003",
    "LOC004",
    "LOC005",
    "LOC006",
    "LOC007",
    "LOC008",
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
    "Unidentified Pewee (Contopus sp.)",
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
    "Notes",
]


def fetch_google_sheet_data() -> Optional[pd.DataFrame]:
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
                return dt_obj.strftime("%Y-%m-%d %H:%M:%S")
            except ValueError as e:
                print(
                    f"EXIF DateTime parsing error for {Path(image_path).name} (Value: '{exif_time_str}'): {e}"
                )

        mtime = os.path.getmtime(image_path)
        return datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S")
    except (FileNotFoundError, UnidentifiedImageError, Exception) as e:
        print(f"Error processing image {Path(image_path).name}: {e}")
        return ""


app_dir = Path(__file__).parent

app_ui = ui.page_fluid(
    ui.tags.style(
        """
        .image-carousel-container {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 10px;
            padding: 10px;
            background-color: #f0f0f0;
            border-radius: 8px;
            min-height: 420px;
            overflow-x: auto;
        }
        .carousel-image {
            border-radius: 5px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
            transition: all 0.3s ease-in-out;
            background-color: white;
            padding: 5px;
        }
        .carousel-image-main {
            height: 400px;
            max-width: 45%;
            object-fit: contain;
        }
        .carousel-image-thumb {
            height: 120px;
            max-width: 12%;
            object-fit: cover;
            opacity: 0.6;
            transform: scale(0.95);
        }
        .carousel-placeholder {
            color: #888;
            font-size: 1.2rem;
            text-align: center;
        }
        .image-preview-grid-container {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 8px;
            padding: 15px;
            min-height: 200px;
            background-color: #f8f9fa;
            border-radius: 8px;
            max-height: 400px;
            overflow-y: auto;
        }
        .preview-grid-image {
            height: 80px;
            width: 100%;
            object-fit: cover;
            cursor: pointer;
            border: 3px solid #dee2e6;
            border-radius: 6px;
            transition: all 0.2s ease;
        }
        .preview-grid-image:hover {
            border-color: #6c757d;
            transform: scale(1.05);
        }
        .selected-preview-image {
            border: 3px solid #007bff;
            box-shadow: 0 0 10px rgba(0, 123, 255, 0.3);
            transform: scale(1.1);
        }
        .image-thumbnail-container {
            position: relative;
            display: inline-block;
        }
        .image-status-icon {
            position: absolute;
            bottom: 2px;
            right: 2px;
            background: rgba(255, 255, 255, 0.9);
            border-radius: 50%;
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        }
        .status-reviewed {
            background: rgba(40, 167, 69, 0.9);
            color: white;
        }
        .status-start {
            background: rgba(23, 162, 184, 0.9);
            color: white;
        }
        .status-end {
            background: rgba(220, 53, 69, 0.9);
            color: white;
        }
        .status-current {
            background: rgba(255, 193, 7, 0.9);
            color: black;
        }
        .image-details-container {
            background-color: #e9ecef;
            padding: 10px;
            border-radius: 6px;
            margin-bottom: 10px;
            border-left: 4px solid #007bff;
        }
        .image-name {
            font-weight: bold;
            color: #495057;
            font-size: 0.9rem;
        }
        .image-info {
            font-size: 0.8rem;
            color: #6c757d;
            margin-top: 4px;
        }
        """
    ),
    ui.include_css(app_dir / "www" / "styles.css"),
    ui.include_js(app_dir / "www" / "keyboard-nav.js"),
    ui.div(
        ui.HTML(
            '''
            <div style="display: flex; align-items: center; padding: 20px 0; border-bottom: 2px solid #dee2e6; margin-bottom: 20px;">
                <img src="https://kauaiseabirdproject.org/wp-content/uploads/2018/08/kesrp-logo.png" 
                     alt="Kauai Seabird Research Project Logo" 
                     style="height: 60px; margin-right: 15px;">
                <h1 style="margin: 0; color: #495057; font-weight: 600;">Seabird Nest Camera Annotation Tool</h1>
            </div>
            '''
        )
    ),
    ui.accordion(
        ui.accordion_panel(
            "Camera Assignments Overview",
            ui.output_ui("google_sheet_display_ui"),
            open=True
        ),
        id="assignments_accordion"
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
                            "Tip: Use ←/→ arrows to navigate, S/E to mark start/end, I for single image"
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
                            f'<div class="sequence-icon pulsing-icon">{icon_svg("film")}</div>'
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
                ui.input_text_area(
                    "notes", "Notes:", "", placeholder="Add any notes here...", rows=2
                ),
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
            ui.output_ui("image_preview_grid_ui"),  # <-- Changed from image_carousel_ui
            ui.output_ui("preview_grid_js"),
            ui.card(
                ui.card_header("Saved Annotations (Current Session)"),
                ui.output_data_frame("annotations_table"),
                ui.div(
                    ui.input_action_button(
                        "sync",
                        ui.HTML(
                            f'<span>{icon_svg("rotate")}</span><span style="margin-left: 8px;">Sync to Google sheets</span>'
                        ),
                        class_="btn-primary sync-animated-btn",
                    ),
                    ui.input_action_button(
                        "clear_data_confirm_modal",  # This ID is now used consistently
                        "Clear All Local Data",
                        icon=icon_svg("trash"),
                        class_="btn-danger",
                    ),
                    class_="action-button-group",
                ),
            ),
            style="display: flex; flex-direction: column; height: 100%;",
        ),
    ),
    theme=shinyswatch.theme.lux,
)


def server(input, output, session):
    google_sheet_df = reactive.Value(fetch_google_sheet_data())
    uploaded_file_info = reactive.Value[list[FileInfo]]([])
    current_image_index = reactive.Value(0)
    marked_start_index = reactive.Value[Optional[int]](None)
    marked_end_index = reactive.Value[Optional[int]](None)
    sequence_start_time = reactive.Value("")
    sequence_end_time = reactive.Value("")
    saved_annotations = reactive.Value(pd.DataFrame(columns=ANNOTATION_COLUMNS))
    is_single_image_mode = reactive.Value(False)
    last_reviewed_index = reactive.Value[Optional[int]](None)
    last_reviewed_filename = reactive.Value("")
    last_reviewed_species = reactive.Value("")
    last_reviewed_type = reactive.Value("")
    last_reviewed_time = reactive.Value("")
    annotated_images = reactive.Value(set())  # Track all annotated images


    @render.ui
    def image_preview_grid_ui():
        files = uploaded_file_info()
        idx = current_image_index()
        if not files:
            return ui.div(
                ui.HTML(f"{icon_svg('image')} <br/> Upload images to begin"),
                class_="image-carousel-container carousel-placeholder",
            )
        req(0 <= idx < len(files))
        
        # Show current image details
        current_file = files[idx]
        current_time = get_image_capture_time(current_file["datapath"])
        image_details = ui.div(
            ui.div(
                ui.span(current_file["name"], class_="image-name"),
                ui.div(
                    f"Image {idx + 1} of {len(files)} | {current_time}",
                    class_="image-info"
                ),
                class_="image-details-container"
            )
        )
        
        # Show 24 images at a time (3 rows of 8), centered on current index
        window_size = 24
        half_window = window_size // 2
        start = max(0, idx - half_window)
        end = min(len(files), start + window_size)
        start = max(0, end - window_size)  # adjust start if near end
        
        image_tags = []
        for i in range(start, end):
            file_info = files[i]
            img_path = file_info["datapath"]
            if not img_path or not Path(img_path).exists():
                continue
            with open(img_path, "rb") as img_file:
                b64_string = base64.b64encode(img_file.read()).decode("utf-8")
            src = f"data:image/jpeg;base64,{b64_string}"
            css_class = "preview-grid-image"
            if i == idx:
                css_class += " selected-preview-image"
            
            # Determine status icon for this image
            status_icon = ""
            status_class = ""
            
            # Check if this image is marked as start or end
            if marked_start_index() == i and marked_end_index() == i:
                # Single image mode
                status_icon = "●"  # Single dot
                status_class = "status-current"
            elif marked_start_index() == i:
                # Sequence start
                status_icon = "▶"  # Play symbol
                status_class = "status-start"
            elif marked_end_index() == i:
                # Sequence end
                status_icon = "■"  # Stop symbol
                status_class = "status-end"
            elif last_reviewed_index() == i:
                # Last reviewed
                status_icon = "✓"  # Check mark
                status_class = "status-reviewed"
            elif file_info["name"] in annotated_images():
                # Previously annotated image
                status_icon = "✓"  # Check mark
                status_class = "status-reviewed"
            
            # Create image container with status icon
            image_container = ui.div(
                ui.tags.img(
                    src=src,
                    class_=css_class,
                    title=file_info["name"],
                    onclick=f"Shiny.setInputValue('selected_image_index', {i});",
                    **{"data-index": i}
                ),
                ui.div(
                    status_icon,
                    class_=f"image-status-icon {status_class}",
                    style="display: block;" if status_icon else "display: none;"
                ),
                class_="image-thumbnail-container"
            )
            
            image_tags.append(image_container)
        
        # Modal for full screen image (hidden by default)
        modal_html = ui.HTML('''
        <div id="fullscreen-modal" style="display:none;position:fixed;z-index:10000;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.95);justify-content:center;align-items:center;cursor:pointer;">
            <div style="position:relative;max-width:95vw;max-height:95vh;">
                <img id="fullscreen-img" src="" style="max-width:100%;max-height:100%;border:4px solid #fff;box-shadow:0 0 20px #000;cursor:default;" />
                <button id="close-fullscreen" style="position:absolute;top:10px;right:10px;background:rgba(255,255,255,0.8);border:none;border-radius:50%;width:40px;height:40px;cursor:pointer;font-size:20px;line-height:1;">×</button>
            </div>
        </div>
        ''')
        
        return ui.div(
            modal_html,
            image_details,
            ui.div(*image_tags, class_="image-preview-grid-container"),
        )

    output.image_carousel_ui = image_preview_grid_ui

    @render.ui
    def preview_grid_js():
        return ui.tags.script(
            '''
            let fullscreenSetup = false;
            
            function setupFullscreen() {
                if (fullscreenSetup) return;
                fullscreenSetup = true;
                
                function showFullscreen(src) {
                    console.log('Showing fullscreen for:', src);
                    var modal = document.getElementById('fullscreen-modal');
                    var img = document.getElementById('fullscreen-img');
                    if (modal && img) {
                        img.src = src;
                        modal.style.display = 'flex';
                        document.body.style.overflow = 'hidden';
                    }
                }
                
                function hideFullscreen() {
                    console.log('Hiding fullscreen');
                    var modal = document.getElementById('fullscreen-modal');
                    if (modal) {
                        modal.style.display = 'none';
                        document.body.style.overflow = 'auto';
                    }
                }
                
                // Double-click handler with preventDefault
                document.addEventListener('dblclick', function(e) {
                    console.log('Double click detected on:', e.target);
                    if (e.target.classList.contains('preview-grid-image')) {
                        e.preventDefault();
                        e.stopPropagation();
                        showFullscreen(e.target.src);
                        return false;
                    }
                });
                
                // Keyboard handler
                document.addEventListener('keydown', function(e) {
                    console.log('Key pressed:', e.key);
                    if (e.key === 'f' || e.key === 'F') {
                        var selected = document.querySelector('.selected-preview-image');
                        if (selected) {
                            e.preventDefault();
                            e.stopPropagation();
                            showFullscreen(selected.src);
                            return false;
                        }
                    }
                    if (e.key === 'Escape') {
                        hideFullscreen();
                    }
                });
                
                // Close button handler
                document.addEventListener('click', function(e) {
                    if (e.target.id === 'close-fullscreen') {
                        e.preventDefault();
                        e.stopPropagation();
                        hideFullscreen();
                        return false;
                    }
                });
                
                // Modal background click to close
                document.addEventListener('click', function(e) {
                    if (e.target.id === 'fullscreen-modal') {
                        hideFullscreen();
                    }
                });
                
                // Prevent image click from closing modal
                document.addEventListener('click', function(e) {
                    if (e.target.id === 'fullscreen-img') {
                        e.stopPropagation();
                    }
                });
            }
            
            // Setup when DOM is ready
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', setupFullscreen);
            } else {
                setupFullscreen();
            }
            
            // Also setup after a short delay to ensure Shiny has rendered
            setTimeout(setupFullscreen, 500);
            '''
        )
    output.preview_grid_js = preview_grid_js

    @reactive.Effect
    @reactive.event(input.selected_image_index)
    def _handle_image_selection():
        selected_idx = input.selected_image_index()
        if selected_idx is not None and 0 <= selected_idx < len(uploaded_file_info()):
            current_image_index.set(selected_idx)

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
            return ui.tags.div(
                ui.HTML('<i class="bi bi-info-circle-fill text-info me-2"></i>'),
                "No assignments found...",
                class_="alert alert-info",
            )
        else:
            return ui.output_data_frame("google_sheet_table")

    @render.ui
    def last_reviewed_info():
        if last_reviewed_index() is None:
            return ui.tags.div(
                ui.HTML(
                    f'<div class="text-muted text-center py-3">{icon_svg("circle-info")} No images reviewed yet</div>'
                )
            )
        return ui.tags.div(
            ui.HTML(
                f"""
                <div class="last-reviewed-info">
                    <h5>{icon_svg('circle-check')} Last Reviewed</h5>
                    <p><strong>File:</strong> {last_reviewed_filename()}</p>
                    <p><strong>Type:</strong> {last_reviewed_type()}</p>
                    <p><strong>Species:</strong> {last_reviewed_species()}</p>
                    <p class="timestamp">{last_reviewed_time()}</p>
                </div>
            """
            )
        )

    @render.data_frame
    def google_sheet_table():
        df = google_sheet_df.get()
        req(df is not None and not df.empty)
        # ... styling logic remains the same ...
        status_col = df["Status"].fillna("").astype(str)
        completed_indices = df.index[status_col == "Completed"].tolist()
        not_started_indices = df.index[status_col == "Not Started"].tolist()
        in_progress_indices = df.index[status_col == "In Progress"].tolist()
        status_col_index = df.columns.get_loc("Status")
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
            unique_names = sorted(
                [
                    name
                    for name in df["Reviewer"].dropna().astype(str).unique()
                    if name.strip()
                ]
            )
            reviewer_choices.extend(unique_names)
        ui.update_select(
            "reviewer_name",
            choices=reviewer_choices,
            selected=(
                input.reviewer_name()
                if input.reviewer_name() in reviewer_choices
                else None
            ),
        )

    @reactive.Effect
    @reactive.event(input.predator_or_seabird)
    def _update_species_behavior_choices():
        species_choices, behavior_choices = (
            (SEABIRD_SPECIES, SEABIRD_BEHAVIORS)
            if input.predator_or_seabird() == "Seabird"
            else (PREDATOR_SPECIES, PREDATOR_BEHAVIORS)
        )
        ui.update_select("species", choices=species_choices, selected="")
        ui.update_select("behavior", choices=behavior_choices, selected="")

    @reactive.Effect
    @reactive.event(input.files)
    def _handle_file_upload():
        files = input.files()
        if not files:
            uploaded_file_info.set([])
        else:
            uploaded_file_info.set(sorted(files, key=lambda f: f["name"]))
        current_image_index.set(0)
        _reset_markings()

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
        annotated_images.set(set())  # Reset annotated images tracking
        last_reviewed_index.set(None)
        last_reviewed_filename.set("")
        last_reviewed_species.set("")
        last_reviewed_type.set("")
        last_reviewed_time.set("")
        ui.update_select("site", selected="")
        ui.update_select("camera", selected="")
        ui.update_date("retrieval_date", value=datetime.now().date())
        ui.update_radio_buttons("predator_or_seabird", selected="Seabird")
        ui.update_select("reviewer_name", selected=None)
        ui.notification_show(
            "All local data and selections cleared.", type="info", duration=4
        )

    @reactive.Effect
    @reactive.event(input.next_img)
    def _go_to_next_image():
        if current_image_index() < len(uploaded_file_info()) - 1:
            current_image_index.set(current_image_index() + 1)

    @reactive.Effect
    @reactive.event(input.prev_img)
    def _go_to_previous_image():
        if current_image_index() > 0:
            current_image_index.set(current_image_index() - 1)

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


    @reactive.Effect
    @reactive.event(input.single_image)
    def _handle_single_image_mode():
        req(uploaded_file_info())
        is_single = input.single_image()
        is_single_image_mode.set(is_single)
        if is_single:
            idx = current_image_index()
            extracted_time = get_image_capture_time(
                uploaded_file_info()[idx]["datapath"]
            )
            marked_start_index.set(idx)
            marked_end_index.set(idx)
            sequence_start_time.set(extracted_time)
            sequence_end_time.set(extracted_time)
            ui.update_text("start_time", value=extracted_time)
            ui.update_text("end_time", value=extracted_time)
            ui.update_checkbox("mark_start", value=True)
            ui.update_checkbox("mark_end", value=True)
            ui.notification_show(
                "Single image mode: Marked as start & end.", type="info", duration=4
            )
        elif (
            marked_start_index.get() == current_image_index()
            and marked_end_index.get() == current_image_index()
        ):
            _reset_markings()

    @reactive.Effect
    @reactive.event(input.mark_start)
    def _handle_mark_start():
        if is_single_image_mode():
            return
        idx = current_image_index()
        req(uploaded_file_info())
        if input.mark_start():
            if marked_end_index.get() == idx:
                ui.notification_show(
                    "Cannot mark same image as start and end.",
                    type="warning",
                    duration=4,
                )
                ui.update_checkbox("mark_start", value=False)
                return
            extracted_time = get_image_capture_time(
                uploaded_file_info()[idx]["datapath"]
            )
            marked_start_index.set(idx)
            sequence_start_time.set(extracted_time)
            ui.update_text("start_time", value=extracted_time)
        elif marked_start_index.get() == idx:
            marked_start_index.set(None)
            sequence_start_time.set("")
            ui.update_text("start_time", value="")

    @reactive.Effect
    @reactive.event(input.mark_end)
    def _handle_mark_end():
        if is_single_image_mode():
            return
        idx = current_image_index()
        req(uploaded_file_info())
        if input.mark_end():
            if marked_start_index.get() == idx:
                ui.notification_show(
                    "Cannot mark same image as start and end.",
                    type="warning",
                    duration=4,
                )
                ui.update_checkbox("mark_end", value=False)
                return
            if marked_start_index.get() is not None and idx < marked_start_index.get():
                ui.notification_show(
                    "Warning: End image is before start image.",
                    type="warning",
                    duration=4,
                )
            extracted_time = get_image_capture_time(
                uploaded_file_info()[idx]["datapath"]
            )
            marked_end_index.set(idx)
            sequence_end_time.set(extracted_time)
            ui.update_text("end_time", value=extracted_time)
        elif marked_end_index.get() == idx:
            marked_end_index.set(None)
            sequence_end_time.set("")
            ui.update_text("end_time", value="")

    @reactive.Effect
    def _update_checkbox_states_on_nav():
        idx = current_image_index()
        start_idx, end_idx, single_mode = (
            marked_start_index(),
            marked_end_index(),
            is_single_image_mode(),
        )
        is_marked_start = start_idx is not None and start_idx == idx
        is_marked_end = end_idx is not None and end_idx == idx
        is_marked_as_single = single_mode and is_marked_start and is_marked_end
        with reactive.isolate():
            ui.update_checkbox("single_image", value=is_marked_as_single)
            ui.update_checkbox("mark_start", value=is_marked_start)
            ui.update_checkbox("mark_end", value=is_marked_end)

    @render.ui
    def marked_start_display():
        start_idx, files = marked_start_index(), uploaded_file_info()
        if start_idx is None:
            return ui.HTML(f"{icon_svg('circle-play')} No start marked")
        name = files[start_idx]["name"]
        display_name = (name[:27] + "...") if len(name) > 30 else name
        return ui.div(
            ui.HTML(f"{icon_svg('circle-play')} Start: {display_name}"),
            class_="text-success",
        )

    @render.ui
    def marked_end_display():
        end_idx, start_idx, files = (
            marked_end_index(),
            marked_start_index(),
            uploaded_file_info(),
        )
        if end_idx is None:
            return ui.HTML(f"{icon_svg('circle-stop')} No end marked")
        name = files[end_idx]["name"]
        display_name = (name[:27] + "...") if len(name) > 30 else name
        is_warning = (
            not is_single_image_mode() and start_idx is not None and end_idx < start_idx
        )
        return ui.div(
            ui.HTML(
                f"{icon_svg('circle-stop')} End: {display_name}"
                + (
                    f" {icon_svg('triangle-exclamation')} Before start!"
                    if is_warning
                    else ""
                )
            ),
            class_="text-warning" if is_warning else "text-primary",
        )

    @reactive.Effect
    @reactive.event(input.save_sequence)
    def _save_sequence():
        # ... Save logic remains the same ...
        files, start_idx, end_idx, single_mode = (
            uploaded_file_info(),
            marked_start_index(),
            marked_end_index(),
            is_single_image_mode(),
        )
        if start_idx is None or end_idx is None:
            return ui.notification_show(
                "Please mark both a start and an end image.", type="error"
            )
        if not single_mode and end_idx < start_idx:
            return ui.notification_show(
                "End image cannot be before the Start image.", type="error"
            )
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
            return ui.notification_show(
                f"Please fill in: {', '.join(missing)}.", type="warning"
            )

        new_sequence = pd.DataFrame(
            {
                "Start Filename": [files[start_idx]["name"]],
                "End Filename": [files[end_idx]["name"]],
                "Site": [input.site()],
                "Camera": [input.camera()],
                "Retrieval Date": [
                    (
                        input.retrieval_date().strftime("%Y-%m-%d")
                        if pd.notna(input.retrieval_date())
                        else ""
                    )
                ],
                "Type": [input.predator_or_seabird()],
                "Species": [input.species()],
                "Behavior": [input.behavior()],
                "Sequence Start Time": [sequence_start_time()],
                "Sequence End Time": [sequence_end_time()],
                "Is Single Image": [single_mode],
                "Reviewer Name": [input.reviewer_name()],
                "Notes": [input.notes()],
            },
            columns=ANNOTATION_COLUMNS,
        )

        saved_annotations.set(
            pd.concat([saved_annotations(), new_sequence], ignore_index=True)
        )

        # Track all images in this annotation as annotated
        current_annotated = set(annotated_images())
        if single_mode:
            # Single image - just add the one image
            current_annotated.add(files[start_idx]["name"])
        else:
            # Sequence - add all images from start to end
            for i in range(start_idx, end_idx + 1):
                current_annotated.add(files[i]["name"])
        annotated_images.set(current_annotated)

        last_reviewed_index.set(current_image_index())
        last_reviewed_filename.set(files[current_image_index()]["name"])
        last_reviewed_species.set(input.species())
        last_reviewed_type.set(input.predator_or_seabird())
        last_reviewed_time.set(datetime.now().strftime("%Y-%m-%d %H:%M:%S"))

        ui.notification_show("Annotation saved!", type="success")
        ui.update_text_area("notes", value="")
        _reset_markings()

    @render.data_frame
    def annotations_table():
        df = saved_annotations.get().copy()
        if df.empty:
            return render.DataGrid(
                pd.DataFrame(
                    columns=["Annotation Type"]
                    + [c for c in ANNOTATION_COLUMNS if c != "Is Single Image"]
                )
            )
        df["Annotation Type"] = df["Is Single Image"].apply(
            lambda x: "Single Image" if x else "Sequence"
        )
        cols = ["Annotation Type"] + [
            c for c in ANNOTATION_COLUMNS if c != "Is Single Image"
        ]
        return render.DataGrid(df[cols].fillna(""), width="100%", height="300px")

    @reactive.Effect
    def _update_button_states():
        idx, count = current_image_index(), len(uploaded_file_info())
        has_files = count > 0
        has_annotations = not saved_annotations().empty
        ui.update_action_button("prev_img", disabled=(not has_files or idx == 0))
        ui.update_action_button(
            "next_img", disabled=(not has_files or idx >= count - 1)
        )
        ui.update_action_button(
            "save_sequence",
            disabled=not (
                has_files
                and marked_start_index() is not None
                and marked_end_index() is not None
            ),
        )
        ui.update_action_button("sync", disabled=not has_annotations)
        ui.update_action_button(
            "clear_data_confirm_modal", disabled=not (has_annotations or has_files)
        )

    @reactive.Effect
    @reactive.event(input.clear_data_confirm_modal)
    def _show_clear_data_modal():
        m = ui.modal(
            "Are you sure you want to clear all local data? Make sure your annotations are saved.",
            title="Confirm Clear Data",
            footer=ui.div(
                ui.input_action_button(
                    "clear_data_confirm", "Confirm", class_="btn-danger me-2"
                ),
                ui.input_action_button(
                    "clear_data_cancel", "Cancel", class_="btn-secondary"
                ),
            ),
            easy_close=True,
            size="m",
        )
        ui.modal_show(m)

    @reactive.Effect
    @reactive.event(input.clear_data_cancel)
    def _cancel_clear_data():
        ui.modal_remove()

    @reactive.Effect
    @reactive.event(input.clear_data_confirm)
    def _handle_clear_data_confirm():
        ui.modal_remove()
        _reset_all_data()

    @reactive.Effect
    @reactive.event(input.sync)
    def _sync_to_google_sheets():
        sync_notification_id = ui.notification_show(
            "Syncing started...", duration=None, type="message"
        )
        try:
            df_to_sync = saved_annotations().copy()
            if df_to_sync.empty:
                raise ValueError("No annotations to sync.")
            creds = Credentials.from_service_account_file(
                CREDENTIALS_FILE, scopes=SCOPES
            )
            client = gspread.authorize(creds)
            sheet = client.open(ANNOTATIONS_GOOGLE_SHEET_NAME).sheet1

            df_to_sync.replace({pd.NA: "", None: ""}, inplace=True)
            df_to_sync = df_to_sync.infer_objects(copy=False)
            df_to_sync["Is Single Image"] = df_to_sync["Is Single Image"].astype(str)

            existing_headers = sheet.get("1:1")[0] if sheet.row_count > 0 else []
            if not existing_headers:
                sheet.update(
                    [df_to_sync.columns.values.tolist()] + df_to_sync.values.tolist(),
                    value_input_option="USER_ENTERED",
                )
            else:
                df_reordered = df_to_sync[existing_headers]
                sheet.append_rows(
                    df_reordered.values.tolist(), value_input_option="USER_ENTERED"
                )

            ui.notification_show(
                f"Successfully synced {len(df_to_sync)} annotations!", type="success"
            )
            # Clear saved annotations but keep image tracking
            saved_annotations.set(pd.DataFrame(columns=ANNOTATION_COLUMNS))
            # Keep annotated_images tracking so user can see reviewed images
        except Exception as e:
            print(f"Sync Error: {e}")
            ui.notification_show(f"Sync failed: {e}", type="error", duration=7)
        finally:
            ui.notification_remove(sync_notification_id)


app = App(app_ui, server)
