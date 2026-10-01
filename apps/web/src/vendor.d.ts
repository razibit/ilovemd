declare module "pdfmake/build/pdfmake" {
  const pdfMake: {
    createPdf(
      definition: unknown,
      tableLayouts?: unknown,
      fonts?: Record<string, Record<string, string>>,
      virtualFileSystem?: Record<string, string>,
    ): { getBlob(callback: (blob: Blob) => void): void };
  };
  export default pdfMake;
}

declare module "pdfmake/build/vfs_fonts" {
  const fonts: Record<string, string>;
  export default fonts;
}
