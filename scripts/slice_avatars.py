import cv2
import numpy as np
import glob
import os
import sys

def slice_spritesheet(filepath):
    basename = os.path.basename(filepath).split('.')[0]
    
    # Leer imagen con canal alfa (transparencia)
    img = cv2.imread(filepath, cv2.IMREAD_UNCHANGED)
    if img is None or img.shape[2] != 4:
        print(f"Saltando {filepath}: No tiene canal de transparencia o no se pudo cargar.")
        return
    
    print(f"\nProcesando {filepath}...")
    
    # Extraer el canal alfa
    alpha = img[:,:,3]
    
    # Encontrar los contornos de las zonas que no son totalmente transparentes
    contours, _ = cv2.findContours(alpha, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    # Calcular las cajas delimitadoras (bounding boxes)
    bounding_boxes = [cv2.boundingRect(c) for c in contours]
    
    # Ordenar las cajas de izquierda a derecha
    bounding_boxes.sort(key=lambda b: b[0])
    
    # Filtrar basura o píxeles sueltos (ignorar zonas de menos de 50x50 píxeles)
    valid_boxes = [b for b in bounding_boxes if b[2] > 50 and b[3] > 50]
    
    print(f"[{basename}] encontrados {len(valid_boxes)} marcos válidos.")
    
    # Recortar y guardar cada marco independiente
    for i, (x, y, w, h) in enumerate(valid_boxes):
        crop = img[y:y+h, x:x+w]
        out_path = os.path.join(os.path.dirname(filepath), f"{basename}_{i+1}.png")
        cv2.imwrite(out_path, crop)
        print(f"  -> Guardado {out_path} (Tamaño: {w}x{h})")

if __name__ == "__main__":
    # Si se pasa un archivo específico como argumento, usarlo. Si no, procesar todos los png de avatars.
    target_dir = os.path.join("client", "public", "avatars")
    
    if len(sys.argv) > 1:
        slice_spritesheet(sys.argv[1])
    else:
        print(f"Buscando spritesheets en {target_dir}...")
        for filepath in glob.glob(os.path.join(target_dir, "*.png")):
            # Ignorar los que ya están separados (terminan en _numero)
            if any(char.isdigit() for char in os.path.basename(filepath).split('.')[0].split('_')[-1]):
                continue
            slice_spritesheet(filepath)
        print("\n¡Proceso completado!")
