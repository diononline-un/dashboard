#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();
            WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External("http://localhost:12345".parse().unwrap()),
            )
            .title("Project Dashboard")
            .inner_size(1440.0, 900.0)
            .min_inner_size(800.0, 600.0)
            .on_navigation(move |url| {
                if url.scheme() == "opencode" {
                    let h = handle.clone();
                    let u = url.to_string();
                    tauri::async_runtime::spawn(async move {
                        let _ = h.opener().open_url(u, None::<&str>);
                    });
                    false
                } else {
                    true
                }
            })
            .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running dashboard");
}
