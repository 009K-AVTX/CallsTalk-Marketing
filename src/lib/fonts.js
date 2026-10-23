// Canvas text inside the 3D scenes needs the web fonts loaded first, or it falls back to a system face.
export function webFontsReady() {
  return Promise.all(['600 30px Poppins', '500 30px Poppins', '400 30px Geist', '500 30px Geist']
    .map((f) => document.fonts.load(f).catch(() => null)));
}
