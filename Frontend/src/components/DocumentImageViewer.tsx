import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
  ScrollView,
} from 'react-native';
import { LoadingIcon } from './LoadingIcon';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from 'react-i18next';

const { width, height } = Dimensions.get('window');

interface DocumentImageViewerProps {
  title: string;
  frontImageUrl?: string | null;
  backImageUrl?: string | null;
  singleImageUrl?: string | null;
}

export default function DocumentImageViewer({
  title,
  frontImageUrl,
  backImageUrl,
  singleImageUrl,
}: DocumentImageViewerProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);

  const openImage = (imageUrl: string) => {
    setSelectedImage(imageUrl);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setSelectedImage(null);
  };

  // Si no hay imágenes, no mostrar nada
  if (!frontImageUrl && !backImageUrl && !singleImageUrl) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>

      <View style={styles.imagesContainer}>
        {/* Imagen única (para póliza de seguro) */}
        {singleImageUrl && (
          <TouchableOpacity
            style={[styles.imageCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => openImage(singleImageUrl)}
          >
            <Image
              source={{ uri: singleImageUrl }}
              style={styles.thumbnail}
              resizeMode="cover"
            />
            <Text style={[styles.imageLabel, { color: colors.text }]}>
              {t('common.components.documentImageViewer.buttons.viewDocument')}
            </Text>
          </TouchableOpacity>
        )}

        {/* Imagen frontal */}
        {frontImageUrl && (
          <TouchableOpacity
            style={[styles.imageCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => openImage(frontImageUrl)}
          >
            <Image
              source={{ uri: frontImageUrl }}
              style={styles.thumbnail}
              resizeMode="cover"
            />
            <Text style={[styles.imageLabel, { color: colors.text }]}>
              {t('common.components.documentImageViewer.buttons.front')}
            </Text>
          </TouchableOpacity>
        )}

        {/* Imagen trasera */}
        {backImageUrl && (
          <TouchableOpacity
            style={[styles.imageCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => openImage(backImageUrl)}
          >
            <Image
              source={{ uri: backImageUrl }}
              style={styles.thumbnail}
              resizeMode="cover"
            />
            <Text style={[styles.imageLabel, { color: colors.text }]}>
              {t('common.components.documentImageViewer.buttons.back')}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Modal para ver imagen en tamaño completo */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={closeModal}
      >
        <View style={styles.modalContainer}>
          <TouchableOpacity
            style={styles.modalBackground}
            activeOpacity={1}
            onPress={closeModal}
          >
            <View style={styles.modalContent}>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={closeModal}
              >
                <Text style={styles.closeButtonText}>
                  {t('common.components.documentImageViewer.buttons.close')}
                </Text>
              </TouchableOpacity>

              {selectedImage && (
                <ScrollView
                  maximumZoomScale={3}
                  minimumZoomScale={1}
                  showsHorizontalScrollIndicator={false}
                  showsVerticalScrollIndicator={false}
                >
                  <Image
                    source={{ uri: selectedImage }}
                    style={styles.fullImage}
                    resizeMode="contain"
                    onLoadStart={() => setImageLoading(true)}
                    onLoadEnd={() => setImageLoading(false)}
                  />
                  {imageLoading && (
                    <LoadingIcon
                      size={32}
                      color="#fff"
                      style={styles.loader}
                    />
                  )}
                </ScrollView>
              )}
            </View>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  imagesContainer: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  imageCard: {
    width: (width - 60) / 2,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  thumbnail: {
    width: '100%',
    height: 120,
  },
  imageLabel: {
    padding: 8,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
  },
  modalBackground: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: width,
    height: height,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  fullImage: {
    width: width,
    height: height * 0.8,
  },
  loader: {
    position: 'absolute',
    top: height / 2 - 20,
    left: width / 2 - 20,
  },
});
