const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { google } = require("googleapis");
const path = require("path");
const fs = require("fs");

const app = express();

/* =========================================================
   CONFIGURATION
========================================================= */

const PORT = process.env.PORT || 3000;

const ROOT_FOLDER_ID =
    "1JU3lJfEDZtn0Y5N-ZTP134wTq0X5FKLy";

/* =========================================================
   FOLDER STRUCTURE
========================================================= */

const STRUCTURE = {

    Lab: [
        "Node-JS",
        "CM",
        "JAVA",
        "DBMS",
        "SE",
        "GS"
    ],

    Theory: [
        "MSF",
        "JAVA",
        "COA",
        "DBMS",
        "SE"
    ],

    Project: [
        "Node-JS",
        "CM",
        "JAVA",
        "DBMS",
        "SE"
    ]

};

/* =========================================================
   ROLL NUMBERS
========================================================= */

const ROLLS = [

    "257R1A66C9",

    "257R1A66D0",
    "257R1A66D1",
    "257R1A66D2",
    "257R1A66D3",
    "257R1A66D4",
    "257R1A66D5",
    "257R1A66D6",
    "257R1A66D7",
    "257R1A66D8",
    "257R1A66D9",

    "257R1A66E0",
    "257R1A66E1",
    "257R1A66E2",
    "257R1A66E3",
    "257R1A66E4",
    "257R1A66E5",
    "257R1A66E6",
    "257R1A66E7",
    "257R1A66E8",
    "257R1A66E9",

    "257R1A66F0",
    "257R1A66F1",
    "257R1A66F2",
    "257R1A66F3",
    "257R1A66F4",
    "257R1A66F5",
    "257R1A66F6",
    "257R1A66F7",
    "257R1A66F8",
    "257R1A66F9",

    "257R1A66G0",
    "257R1A66G1",
    "257R1A66G2",
    "257R1A66G3",
    "257R1A66G4",
    "257R1A66G5",
    "257R1A66G6",
    "257R1A66G7",
    "257R1A66G8",
    "257R1A66G9",

    "257R1A66H0",
    "257R1A66H1",
    "257R1A66H2",
    "257R1A66H3",
    "257R1A66H4",
    "257R1A66H5",
    "257R1A66H6",
    "257R1A66H7",
    "257R1A66H8",
    "257R1A66H9",

    "257R1A66J0",
    "257R1A66J1",
    "257R1A66J3",
    "257R1A66J4",
    "257R1A66J6",
    "257R1A66J7",
    "257R1A66J8",
    "257R1A66J9",

    "257R1A66K0",
    "257R1A66K1",
    "257R1A66K2",

    "267R5A6615",
    "267R5A6616",
    "267R5A6617",
    "267R5A6618",
    "267R5A6619",
    "267R5A6620",
    "267R5A6621",
    "267R5A6622"
];

/* =========================================================
   MIDDLEWARE
========================================================= */

app.use(cors());

app.use(express.json());

app.use(express.urlencoded({
    extended: true
}));

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);

/*
   Store uploaded PPT temporarily.

   IMPORTANT:
   The file is NOT converted to Base64.

   Browser
       ↓
   multipart/form-data
       ↓
   Multer
       ↓
   Temporary file
       ↓
   Google Drive
*/

const upload = multer({

    dest: path.join(
        __dirname,
        "uploads"
    ),

    limits: {
        fileSize: 100 * 1024 * 1024
    },

    fileFilter: function (
        req,
        file,
        callback
    ) {

        const valid =
            /\.(ppt|pptx)$/i.test(
                file.originalname
            );

        if (!valid) {

            return callback(
                new Error(
                    "Only PPT and PPTX files are allowed."
                )
            );

        }

        callback(null, true);

    }

});

/* =========================================================
   GOOGLE AUTHENTICATION
========================================================= */

/*
   LOCAL:
       service-account.json

   RENDER:
       secret file can be mounted at
       /etc/secrets/service-account.json

   The code checks Render's secret location first.
*/

let credentialsPath;

if (
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON
) {

    /*
       Optional:
       credentials supplied as an environment variable.
    */

    credentialsPath = null;

} else if (
    fs.existsSync(
        "/etc/secrets/service-account.json"
    )
) {

    credentialsPath =
        "/etc/secrets/service-account.json";

} else {

    credentialsPath =
        path.join(
            __dirname,
            "service-account.json"
        );

}

/* =========================================================
   GOOGLE DRIVE AUTH
========================================================= */

let auth;

if (
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON
) {

    let credentials;

    try {

        credentials =
            JSON.parse(
                process.env.GOOGLE_SERVICE_ACCOUNT_JSON
            );

    } catch (error) {

        console.error(
            "Invalid GOOGLE_SERVICE_ACCOUNT_JSON"
        );

        process.exit(1);

    }

    auth =
        new google.auth.GoogleAuth({

            credentials: credentials,

            scopes: [
                "https://www.googleapis.com/auth/drive"
            ]

        });

} else {

    auth =
        new google.auth.GoogleAuth({

            keyFile: credentialsPath,

            scopes: [
                "https://www.googleapis.com/auth/drive"
            ]

        });

}

const drive =
    google.drive({

        version: "v3",

        auth: auth

    });

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get(
    "/api/health",
    async function (req, res) {

        try {

            const response =
                await drive.files.get({

                    fileId:
                        ROOT_FOLDER_ID,

                    fields:
                        "id,name,mimeType"

                });

            res.json({

                ok: true,

                message:
                    "Google Drive connection is working.",

                folder:
                    response.data

            });

        } catch (error) {

            console.error(
                "HEALTH ERROR:",
                error
            );

            res.status(500).json({

                ok: false,

                error:
                    error.message

            });

        }

    }
);

/* =========================================================
   GET FOLDER
========================================================= */

async function findFolder(
    parentId,
    folderName
) {

    const response =
        await drive.files.list({

            q:
                `'${parentId}' in parents` +
                ` and name = '${escapeQuery(folderName)}'` +
                ` and mimeType = 'application/vnd.google-apps.folder'` +
                ` and trashed = false`,

            fields:
                "files(id,name)",

            pageSize: 10

        });

    if (
        !response.data.files ||
        response.data.files.length === 0
    ) {

        throw new Error(
            `Folder not found: ${folderName}`
        );

    }

    return response.data.files[0];

}

/* =========================================================
   FIND CATEGORY → SUBJECT FOLDER
========================================================= */

async function getSubjectFolder(
    category,
    subject
) {

    if (
        !STRUCTURE[category]
    ) {

        throw new Error(
            "Invalid presentation type."
        );

    }

    if (
        STRUCTURE[category]
            .indexOf(subject) === -1
    ) {

        throw new Error(
            `${subject} is not available under ${category}.`
        );

    }

    const categoryFolder =
        await findFolder(
            ROOT_FOLDER_ID,
            category
        );

    const subjectFolder =
        await findFolder(
            categoryFolder.id,
            subject
        );

    return subjectFolder;

}

/* =========================================================
   DUPLICATE CHECK
========================================================= */

async function checkDuplicate(
    folderId,
    roll
) {

    const response =
        await drive.files.list({

            q:
                `'${folderId}' in parents` +
                ` and trashed = false`,

            fields:
                "files(id,name)",

            pageSize: 1000

        });

    const files =
        response.data.files || [];

    const prefix =
        roll.toUpperCase() + "_";

    for (
        let i = 0;
        i < files.length;
        i++
    ) {

        const name =
            String(
                files[i].name || ""
            ).toUpperCase();

        if (
            name.indexOf(prefix) === 0
        ) {

            return files[i];

        }

    }

    return null;

}

/* =========================================================
   UPLOAD PPT
========================================================= */

app.post(
    "/api/upload",
    upload.single("file"),
    async function (req, res) {

        let temporaryFile = null;

        try {

            /* ---------------------------------------------
               CHECK FILE
            --------------------------------------------- */

            if (!req.file) {

                return res.status(400).json({

                    ok: false,

                    error:
                        "No PPT file received."

                });

            }

            temporaryFile =
                req.file.path;

            /* ---------------------------------------------
               GET FORM DATA
            --------------------------------------------- */

            const roll =
                String(
                    req.body.roll || ""
                )
                .trim()
                .toUpperCase();

            const subject =
                String(
                    req.body.subject || ""
                )
                .trim();

            const category =
                String(
                    req.body.category || ""
                )
                .trim();

            /* ---------------------------------------------
               VALIDATE ROLL
            --------------------------------------------- */

            if (!roll) {

                return res.status(400).json({

                    ok: false,

                    error:
                        "Roll number is required."

                });

            }

            if (
                ROLLS.indexOf(roll) === -1
            ) {

                return res.status(400).json({

                    ok: false,

                    error:
                        "Invalid roll number."

                });

            }

            /* ---------------------------------------------
               VALIDATE CATEGORY
            --------------------------------------------- */

            if (
                !category ||
                !STRUCTURE[category]
            ) {

                return res.status(400).json({

                    ok: false,

                    error:
                        "Invalid presentation type."

                });

            }

            /* ---------------------------------------------
               VALIDATE SUBJECT
            --------------------------------------------- */

            if (
                STRUCTURE[category]
                    .indexOf(subject) === -1
            ) {

                return res.status(400).json({

                    ok: false,

                    error:
                        `${subject} is not available under ${category}.`

                });

            }

            /* ---------------------------------------------
               FIND DRIVE FOLDER
            --------------------------------------------- */

            const folder =
                await getSubjectFolder(
                    category,
                    subject
                );

            /* ---------------------------------------------
               DUPLICATE CHECK
            --------------------------------------------- */

            const duplicate =
                await checkDuplicate(
                    folder.id,
                    roll
                );

            if (duplicate) {

                return res.status(409).json({

                    ok: false,

                    duplicate: true,

                    error:
                        `You have already submitted a PPT for ${subject} - ${category}.`

                });

            }

            /* ---------------------------------------------
               FINAL FILE NAME
            --------------------------------------------- */

            const cleanName =
                cleanFileName(
                    req.file.originalname
                );

            const safeSubject =
                subject.replace(
                    /[^a-zA-Z0-9-]/g,
                    "_"
                );

            const finalName =
                `${roll}_${safeSubject}_${category}_${cleanName}`;

            /* ---------------------------------------------
               MIME TYPE
            --------------------------------------------- */

            let mimeType =
                "application/vnd.openxmlformats-officedocument.presentationml.presentation";

            if (
                /\.ppt$/i.test(
                    cleanName
                )
            ) {

                mimeType =
                    "application/vnd.ms-powerpoint";

            }

            /* ---------------------------------------------
               UPLOAD DIRECTLY FROM TEMPORARY FILE
               TO GOOGLE DRIVE
            --------------------------------------------- */

            const response =
                await drive.files.create({

                    requestBody: {

                        name:
                            finalName,

                        parents: [
                            folder.id
                        ],

                        mimeType:
                            mimeType

                    },

                    media: {

                        mimeType:
                            mimeType,

                        body:
                            fs.createReadStream(
                                temporaryFile
                            )

                    },

                    fields:
                        "id,name,webViewLink,webContentLink"

                });

            const file =
                response.data;

            /* ---------------------------------------------
               MAKE FILE VIEWABLE
               --------------------------------------------- */

            try {

                await drive.permissions.create({

                    fileId:
                        file.id,

                    requestBody: {

                        type:
                            "anyone",

                        role:
                            "reader"

                    }

                });

            } catch (shareError) {

                console.log(
                    "Public permission could not be applied:",
                    shareError.message
                );

            }

            /* ---------------------------------------------
               DRIVE URL
            --------------------------------------------- */

            const presentationUrl =
                `https://docs.google.com/presentation/d/${file.id}/edit`;

            const driveUrl =
                `https://drive.google.com/file/d/${file.id}/view`;

            /* ---------------------------------------------
               DELETE TEMPORARY FILE
            --------------------------------------------- */

            safeDelete(
                temporaryFile
            );

            temporaryFile = null;

            /* ---------------------------------------------
               RESPONSE
            --------------------------------------------- */

            res.json({

                ok: true,

                message:
                    "PPT uploaded successfully.",

                roll:
                    roll,

                subject:
                    subject,

                category:
                    category,

                fileName:
                    file.name,

                fileId:
                    file.id,

                presentationUrl:
                    presentationUrl,

                driveUrl:
                    driveUrl

            });

        } catch (error) {

            console.error(
                "UPLOAD ERROR:",
                error
            );

            if (
                temporaryFile
            ) {

                safeDelete(
                    temporaryFile
                );

            }

            res.status(500).json({

                ok: false,

                error:
                    error.message ||
                    "Upload failed."

            });

        }

    }
);

/* =========================================================
   GET PPTs
========================================================= */

app.get(
    "/api/ppts",
    async function (req, res) {

        try {

            const subject =
                String(
                    req.query.subject || ""
                ).trim();

            const category =
                String(
                    req.query.category || ""
                ).trim();

            if (
                !STRUCTURE[category]
            ) {

                return res.status(400).json({

                    ok: false,

                    error:
                        "Invalid presentation type."

                });

            }

            if (
                STRUCTURE[category]
                    .indexOf(subject) === -1
            ) {

                return res.status(400).json({

                    ok: false,

                    error:
                        "Invalid subject."

                });

            }

            const folder =
                await getSubjectFolder(
                    category,
                    subject
                );

            const response =
                await drive.files.list({

                    q:
                        `'${folder.id}' in parents` +
                        ` and trashed = false`,

                    fields:
                        "files(id,name,createdTime,mimeType,webViewLink)",

                    pageSize:
                        1000,

                    orderBy:
                        "name"

                });

            const files =
                response.data.files || [];

            const submissions = [];

            for (
                let i = 0;
                i < files.length;
                i++
            ) {

                const file =
                    files[i];

                if (
                    !/\.(ppt|pptx)$/i.test(
                        file.name
                    )
                ) {

                    continue;

                }

                const roll =
                    extractRoll(
                        file.name
                    );

                if (!roll) {

                    continue;

                }

                submissions.push({

                    roll:
                        roll,

                    fileName:
                        file.name,

                    fileId:
                        file.id,

                    presentationUrl:
                        `https://docs.google.com/presentation/d/${file.id}/edit`,

                    driveUrl:
                        `https://drive.google.com/file/d/${file.id}/view`,

                    createdAt:
                        file.createdTime

                });

            }

            /* ---------------------------------------------
               SORT USING ROLL LIST
            --------------------------------------------- */

            submissions.sort(
                function (a, b) {

                    return (
                        ROLLS.indexOf(a.roll) -
                        ROLLS.indexOf(b.roll)
                    );

                }
            );

            res.json({

                ok: true,

                subject:
                    subject,

                category:
                    category,

                count:
                    submissions.length,

                submissions:
                    submissions

            });

        } catch (error) {

            console.error(
                "GET PPT ERROR:",
                error
            );

            res.status(500).json({

                ok: false,

                error:
                    error.message

            });

        }

    }
);

/* =========================================================
   GET STRUCTURE
========================================================= */

app.get(
    "/api/structure",
    function (req, res) {

        res.json({

            ok: true,

            structure:
                STRUCTURE

        });

    }
);

/* =========================================================
   HELPERS
========================================================= */

function extractRoll(
    name
) {

    const upper =
        String(
            name || ""
        ).toUpperCase();

    for (
        let i = 0;
        i < ROLLS.length;
        i++
    ) {

        if (
            upper.indexOf(
                ROLLS[i]
            ) === 0
        ) {

            return ROLLS[i];

        }

    }

    return "";

}

/* =========================================================
   CLEAN FILE NAME
========================================================= */

function cleanFileName(
    name
) {

    return String(
        name || ""
    )
    .trim()
    .replace(
        /[\\\/:*?"<>|]/g,
        "_"
    );

}

/* =========================================================
   ESCAPE DRIVE QUERY
========================================================= */

function escapeQuery(
    value
) {

    return String(
        value || ""
    )
    .replace(
        /\\/g,
        "\\\\"
    )
    .replace(
        /'/g,
        "\\'"
    );

}

/* =========================================================
   DELETE TEMP FILE
========================================================= */

function safeDelete(
    filePath
) {

    try {

        if (
            filePath &&
            fs.existsSync(filePath)
        ) {

            fs.unlinkSync(
                filePath
            );

        }

    } catch (error) {

        console.log(
            "Temporary file cleanup failed:",
            error.message
        );

    }

}

/* =========================================================
   ERROR HANDLER
========================================================= */

app.use(
    function (
        error,
        req,
        res,
        next
    ) {

        console.error(
            "SERVER ERROR:",
            error
        );

        if (
            error &&
            error.code === "LIMIT_FILE_SIZE"
        ) {

            return res.status(413).json({

                ok: false,

                error:
                    "File is too large. Maximum size is 100 MB."

            });

        }

        res.status(500).json({

            ok: false,

            error:
                error.message ||
                "Server error."

        });

    }
);

/* =========================================================
   START SERVER
========================================================= */

app.listen(
    PORT,
    "0.0.0.0",
    function () {

        console.log("");
        console.log(
            "===================================="
        );
        console.log(
            "          CSM PPT SYSTEM"
        );
        console.log(
            "===================================="
        );
        console.log(
            `Server: http://localhost:${PORT}`
        );
        console.log(
            `Student: http://localhost:${PORT}/`
        );
        console.log(
            `Dashboard: http://localhost:${PORT}/dashboard.html`
        );
        console.log(
            `Health: http://localhost:${PORT}/api/health`
        );
        console.log(
            "===================================="
        );
        console.log("");

    }
);