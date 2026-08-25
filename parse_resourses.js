(async () => {
    // ============================================================
    // Настройки
    // ============================================================

    const RESOURCE_SELECTOR =
        "div.modtype_resource > div > a";

    const FOLDER_SELECTOR =
        "div.modtype_folder > div > a";

    const FOLDER_FILE_SELECTOR =
        ".fp-filename > a";

    // ============================================================
    // Вспомогательные функции
    // ============================================================

    const pad = n =>
        String(n).padStart(2, "0");

    const safeName = name =>
        name
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
            .trim();

    // ------------------------------------------------------------
    // Определяем расширение обычного resource
    // ------------------------------------------------------------

    function getExtension(response, url) {
        // Content-Disposition
        const disposition =
            response.headers.get(
                "Content-Disposition"
            );

        if (disposition) {
            const utf8Match =
                disposition.match(
                    /filename\*=UTF-8''([^;]+)/i
                );

            if (utf8Match) {
                const filename =
                    decodeURIComponent(
                        utf8Match[1]
                    );

                const dot =
                    filename.lastIndexOf(".");

                if (
                    dot > 0 &&
                    dot < filename.length - 1
                ) {
                    return filename.substring(dot);
                }
            }

            const normalMatch =
                disposition.match(
                    /filename="?([^";]+)"?/i
                );

            if (normalMatch) {
                const filename =
                    normalMatch[1];

                const dot =
                    filename.lastIndexOf(".");

                if (
                    dot > 0 &&
                    dot < filename.length - 1
                ) {
                    return filename.substring(dot);
                }
            }
        }

        // Content-Type
        const contentType =
            response.headers
                .get("Content-Type")
                ?.split(";")[0]
                .trim()
                .toLowerCase();

        const mimeExtensions = {
            "application/pdf": ".pdf",

            "application/msword": ".doc",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",

            "application/vnd.ms-powerpoint": ".ppt",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",

            "application/vnd.ms-excel": ".xls",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",

            "text/plain": ".txt",
            "text/csv": ".csv",

            "application/zip": ".zip",
            "application/x-rar-compressed": ".rar",
            "application/x-7z-compressed": ".7z",

            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/gif": ".gif",
            "image/webp": ".webp",

            "audio/mpeg": ".mp3",
            "audio/wav": ".wav",

            "video/mp4": ".mp4",
            "video/webm": ".webm"
        };

        if (
            contentType &&
            mimeExtensions[contentType]
        ) {
            return mimeExtensions[contentType];
        }

        // URL
        try {
            const pathname =
                new URL(url).pathname;

            const filename =
                decodeURIComponent(
                    pathname.split("/").pop() || ""
                );

            const dot =
                filename.lastIndexOf(".");

            if (
                dot > 0 &&
                dot < filename.length - 1
            ) {
                return filename.substring(dot);
            }
        } catch {}

        return "";
    }

    // ============================================================
    // CRC32
    // ============================================================

    function crc32(data) {
        let crc = 0xFFFFFFFF;

        for (let i = 0; i < data.length; i++) {
            crc ^= data[i];

            for (let j = 0; j < 8; j++) {
                crc =
                    (crc >>> 1) ^
                    (0xEDB88320 & -(crc & 1));
            }
        }

        return (
            crc ^ 0xFFFFFFFF
        ) >>> 0;
    }

    // ============================================================
    // Uint16 / Uint32
    // ============================================================

    function uint16(value) {
        return new Uint8Array([
            value & 0xFF,
            (value >>> 8) & 0xFF
        ]);
    }

    function uint32(value) {
        return new Uint8Array([
            value & 0xFF,
            (value >>> 8) & 0xFF,
            (value >>> 16) & 0xFF,
            (value >>> 24) & 0xFF
        ]);
    }

    // ============================================================
    // concat
    // ============================================================

    function concat(...arrays) {
        const totalLength =
            arrays.reduce(
                (sum, arr) =>
                    sum + arr.length,
                0
            );

        const result =
            new Uint8Array(totalLength);

        let offset = 0;

        for (const arr of arrays) {
            result.set(arr, offset);
            offset += arr.length;
        }

        return result;
    }

    const encoder =
        new TextEncoder();

    // ============================================================
    // Список файлов
    // ============================================================

    const files = [];

    // ============================================================
    // Добавление файла
    // ============================================================

    function addFile(
        filename,
        data
    ) {
        filename = safeName(filename);

        if (!filename) {
            filename = "unnamed";
        }

        let finalFilename =
            filename;

        let counter = 1;

        while (
            files.some(
                file =>
                    file.name ===
                    finalFilename
            )
        ) {
            const dot =
                filename.lastIndexOf(".");

            const base =
                dot > 0
                    ? filename.substring(
                        0,
                        dot
                    )
                    : filename;

            const extension =
                dot > 0
                    ? filename.substring(dot)
                    : "";

            finalFilename =
                `${base} (${counter++})${extension}`;
        }

        files.push({
            name: finalFilename,
            data
        });

        return finalFilename;
    }

    // ============================================================
    // Страница курса
    // ============================================================

    const resources = [
        ...document.querySelectorAll(
            RESOURCE_SELECTOR
        )
    ];

    const folders = [
        ...document.querySelectorAll(
            FOLDER_SELECTOR
        )
    ];

    console.log(
        `Обычных ресурсов: ${resources.length}`
    );

    console.log(
        `Папок: ${folders.length}`
    );

    // ============================================================
    // Название курса
    // ============================================================

    const courseName =
        document
            .querySelector(
                "h1.h2.mb-0"
            )
            ?.textContent
            .trim() ||
        "Moodle course";

    // ============================================================
    // Имя ZIP
    // ============================================================

    const now =
        new Date();

    const dateString =
        `${pad(now.getDate())}.` +
        `${pad(now.getMonth() + 1)}.` +
        `${now.getFullYear()} ` +
        `${pad(now.getHours())}:` +
        `${pad(now.getMinutes())}`;

    const zipName =
        `${dateString} - ` +
        `${safeName(courseName)}.zip`;

    console.log(
        `Архив: ${zipName}`
    );

    // ============================================================
    // 1. Обычные resources
    // ============================================================

    console.log("");
    console.log(
        "========== RESOURCES =========="
    );

    for (
        let i = 0;
        i < resources.length;
        i++
    ) {
        const link =
            resources[i];

        const url =
            link.href;

        console.log(
            `[Resource ${i + 1}/${resources.length}] ${url}`
        );

        try {
            const response =
                await fetch(
                    url,
                    {
                        credentials:
                            "include"
                    }
                );

            if (!response.ok) {
                throw new Error(
                    `HTTP ${response.status} ` +
                    `${response.statusText}`
                );
            }

            const blob =
                await response.blob();

            const data =
                new Uint8Array(
                    await blob.arrayBuffer()
                );

            let filename =
                link
                    .querySelector("span")
                    ?.innerText
                    .split("\n")[0]
                    .trim();

            if (!filename) {
                filename =
                    `file_${i + 1}`;
            }

            const extension =
                getExtension(
                    response,
                    url
                );

            filename += extension;

            const finalFilename =
                addFile(
                    filename,
                    data
                );

            console.log(
                `  ✓ ${finalFilename} ` +
                `(${(
                    data.length /
                    1024 /
                    1024
                ).toFixed(2)} MB)`
            );

        } catch (error) {
            console.error(
                `  ✗ Ошибка: ${url}`,
                error
            );
        }
    }

    // ============================================================
    // 2. Папки
    // ============================================================

    console.log("");
    console.log(
        "========== FOLDERS =========="
    );

    for (
        let i = 0;
        i < folders.length;
        i++
    ) {
        const folderLink =
            folders[i];

        const folderUrl =
            folderLink.href;

        let folderName =
            folderLink
                .querySelector("span")
                ?.innerText
                .split("\n")[0]
                .trim();

        if (!folderName) {
            folderName =
                `Folder_${i + 1}`;
        }

        folderName =
            safeName(folderName);

        console.log("");
        console.log(
            `[Folder ${i + 1}/${folders.length}] ` +
            `${folderName}`
        );

        console.log(
            `  Открываю: ${folderUrl}`
        );

        try {
            // --------------------------------------------------------
            // Загружаем страницу папки
            // --------------------------------------------------------

            const response =
                await fetch(
                    folderUrl,
                    {
                        credentials:
                            "include"
                    }
                );

            if (!response.ok) {
                throw new Error(
                    `HTTP ${response.status} ` +
                    `${response.statusText}`
                );
            }

            const html =
                await response.text();

            // --------------------------------------------------------
            // Парсим HTML
            // --------------------------------------------------------

            const parser =
                new DOMParser();

            const folderDocument =
                parser.parseFromString(
                    html,
                    "text/html"
                );

            const folderFiles = [
                ...folderDocument.querySelectorAll(
                    FOLDER_FILE_SELECTOR
                )
            ];

            console.log(
                `  Найдено файлов: ${folderFiles.length}`
            );

            // --------------------------------------------------------
            // Скачиваем файлы папки
            // --------------------------------------------------------

            for (
                let j = 0;
                j < folderFiles.length;
                j++
            ) {
                const fileLink =
                    folderFiles[j];

                const fileUrl =
                    fileLink.href;

                let filename =
                    fileLink
                        .innerText
                        .trim();

                if (!filename) {
                    filename =
                        `file_${j + 1}`;
                }

                console.log(
                    `  [${j + 1}/${folderFiles.length}] ` +
                    `${filename}`
                );

                try {
                    const fileResponse =
                        await fetch(
                            fileUrl,
                            {
                                credentials:
                                    "include"
                            }
                        );

                    if (!fileResponse.ok) {
                        throw new Error(
                            `HTTP ${fileResponse.status} ` +
                            `${fileResponse.statusText}`
                        );
                    }

                    const blob =
                        await fileResponse.blob();

                    const data =
                        new Uint8Array(
                            await blob.arrayBuffer()
                        );

                    // ------------------------------------------------
                    // В ZIP сохраняем папку
                    // ------------------------------------------------

                    const zipPath =
                        `${folderName}/${filename}`;

                    const finalFilename =
                        addFile(
                            zipPath,
                            data
                        );

                    console.log(
                        `    ✓ ${finalFilename} ` +
                        `(${(
                            data.length /
                            1024 /
                            1024
                        ).toFixed(2)} MB)`
                    );

                } catch (error) {
                    console.error(
                        `    ✗ Ошибка: ${fileUrl}`,
                        error
                    );
                }
            }

        } catch (error) {
            console.error(
                `  ✗ Не удалось открыть папку:`,
                error
            );
        }
    }

    // ============================================================
    // Создание ZIP
    // ============================================================

    console.log("");
    console.log(
        "========== CREATE ZIP =========="
    );

    console.log(
        `Всего файлов: ${files.length}`
    );

    const localParts = [];
    const centralParts = [];

    let offset = 0;

    for (
        let i = 0;
        i < files.length;
        i++
    ) {
        const file =
            files[i];

        const filenameBytes =
            encoder.encode(
                file.name
            );

        const data =
            file.data;

        const checksum =
            crc32(data);

        // --------------------------------------------------------
        // Local header
        // --------------------------------------------------------

        const localHeader =
            concat(
                uint32(0x04034B50),
                uint16(20),
                uint16(0x0800),
                uint16(0),
                uint16(0),
                uint16(0),
                uint32(checksum),
                uint32(data.length),
                uint32(data.length),
                uint16(filenameBytes.length),
                uint16(0),
                filenameBytes,
                data
            );

        localParts.push(
            localHeader
        );

        // --------------------------------------------------------
        // Central directory
        // --------------------------------------------------------

        const centralHeader =
            concat(
                uint32(0x02014B50),
                uint16(20),
                uint16(20),
                uint16(0x0800),
                uint16(0),
                uint16(0),
                uint16(0),
                uint32(checksum),
                uint32(data.length),
                uint32(data.length),
                uint16(filenameBytes.length),
                uint16(0),
                uint16(0),
                uint16(0),
                uint16(0),
                uint32(0),
                uint32(offset),
                filenameBytes
            );

        centralParts.push(
            centralHeader
        );

        offset +=
            localHeader.length;

        const percent =
            (
                (i + 1) /
                files.length *
                100
            ).toFixed(0);

        console.log(
            `ZIP: ${percent}%`
        );
    }

    // ============================================================
    // Central directory
    // ============================================================

    const centralDirectory =
        concat(
            ...centralParts
        );

    const localData =
        concat(
            ...localParts
        );

    const endOfCentralDirectory =
        concat(
            uint32(0x06054B50),
            uint16(0),
            uint16(0),
            uint16(files.length),
            uint16(files.length),
            uint32(
                centralDirectory.length
            ),
            uint32(
                localData.length
            ),
            uint16(0)
        );

    const zipData =
        concat(
            localData,
            centralDirectory,
            endOfCentralDirectory
        );

    // ============================================================
    // Download ZIP
    // ============================================================

    const zipBlob =
        new Blob(
            [zipData],
            {
                type:
                    "application/zip"
            }
        );

    const downloadUrl =
        URL.createObjectURL(
            zipBlob
        );

    const a =
        document.createElement("a");

    a.href =
        downloadUrl;

    a.download =
        zipName;

    document.body.appendChild(a);

    a.click();

    a.remove();

    setTimeout(
        () =>
            URL.revokeObjectURL(
                downloadUrl
            ),
        10000
    );

    // ============================================================
    // Готово
    // ============================================================

    console.log("");
    console.log(
        "================================"
    );

    console.log(
        "Готово!"
    );

    console.log(
        `Файлов: ${files.length}`
    );

    console.log(
        `Размер ZIP: ${(
            zipData.length /
            1024 /
            1024
        ).toFixed(2)} MB`
    );

    console.log(
        `Имя: ${zipName}`
    );

    console.log(
        "================================"
    );

    alert(
        `Готово!\n\n` +
        `Файлов: ${files.length}\n` +
        `Размер ZIP: ${(
            zipData.length /
            1024 /
            1024
        ).toFixed(2)} MB\n\n` +
        zipName
    );
})();