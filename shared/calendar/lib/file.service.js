"use client";

const UPLOAD_FILE_MUTATION = `
    mutation UploadFile(
      $file: Upload!
      $attached_to_doctype: String
      $attached_to_name: String
      $fieldname: String
      $is_private: Boolean
    ) {
      uploadFile(
        file: $file
        attached_to_doctype: $attached_to_doctype
        attached_to_name: $attached_to_name
        fieldname: $fieldname
        is_private: $is_private
      ) {
        name
        file_url
      }
    }
  `;

export async function uploadFileToDoc({
  file,
  doctype,
  docname,
  fieldname,
  erpUrl,
  authToken,
  isPrivate = true,
}) {
  const formData = new FormData();

  formData.append(
    "operations",
    JSON.stringify({
      query: UPLOAD_FILE_MUTATION,
      variables: {
        file: null,
        attached_to_doctype: doctype ?? null,
        attached_to_name: docname ?? null,
        fieldname: fieldname ?? null,
        is_private: isPrivate,
      },
    })
  );

  formData.append(
    "map",
    JSON.stringify({
      "0": ["variables.file"],
    })
  );

  formData.append("0", file);

  const res = await fetch(erpUrl, {
    method: "POST",
    headers: {
      Authorization: `token ${authToken}`,
    },
    body: formData,
  });
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors[0].message);
  }
  const uploaded = json.data?.uploadFile;

  return {
    fileUrl: uploaded?.file_url,
    fileName: uploaded?.name,
  };
}

export async function uploadLeaveMedicalCertificate(values, leaveName,erpUrl,authToken) {
  if (!values?.medicalAttachment || !leaveName) return;

  return uploadFileToDoc({
    file: values.medicalAttachment,
    doctype: "Leave Application",
    docname: leaveName,
    fieldname: "custom_attachement",
    erpUrl,
    authToken,
  });
}
