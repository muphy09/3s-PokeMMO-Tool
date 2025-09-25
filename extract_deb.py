import pathlib
import sys

def extract_deb(deb_path):
    deb_path = pathlib.Path(deb_path)
    data_tar = deb_path.with_suffix(deb_path.suffix + '.data.tar.xz')
    with deb_path.open('rb') as f:
        header = f.read(8)
        if header != b'!<arch>\n':
            raise SystemExit(f"{deb_path} is not an ar archive")
        while True:
            hdr = f.read(60)
            if not hdr:
                break
            if len(hdr) < 60:
                break
            name = hdr[:16].decode('ascii').strip()
            size = int(hdr[48:58].decode('ascii').strip())
            data = f.read(size)
            if name.startswith('data.tar'):
                data_tar.write_bytes(data)
            if size % 2 == 1:
                f.read(1)
    return data_tar

if __name__ == '__main__':
    for deb in sys.argv[1:]:
        out = extract_deb(deb)
        print(f"Extracted {out}")
